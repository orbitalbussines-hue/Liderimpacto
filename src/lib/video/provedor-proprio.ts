import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { z } from "zod";
import { ErroDeNegocio } from "@/lib/acao";
import {
  abortarEnvioMultipart,
  apagarObjeto,
  apagarPrefixo,
  assinarPartesMultipart,
  cabecalhoDoObjeto,
  concluirEnvioMultipart,
  iniciarEnvioMultipart,
} from "@/lib/armazenamento/cliente";
import { chaveDoCriador } from "@/lib/armazenamento/regras";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db, type Transacao } from "@/lib/db";
import { produtos_modulos_aulas, produtos_modulos_aulas_videos as videos } from "@/lib/db/schema";
import { marcaDeExclusao, vivos } from "@/lib/db/soft-delete";
import { notificarAulaNova } from "@/lib/notificacoes/gerar";
import { cifrarChave, decifrarChave, gerarChaveVideo } from "./chaves";
import { enfileirarComPrazo } from "./fila";
import { comToken } from "./playlist";
import type { ContextoVideo, Envio, EstadoVideo, EventoVideo, PedidoEnvio, ProvedorVideo, Reproducao } from "./provedor";
import { aplicarEvento, estadoDoVideo, videoVivo, videoVivoDaAula } from "./registro";
import { TAMANHO_PARTE_VIDEO, totalDePartes, validarEnvioVideo } from "./regras";
import { abrirSessaoReproducao, renovarSessaoReproducao } from "./reproducao";
import { assinarToken, expiracaoPadrao } from "./token";

/**
 * Provedor self-host (ADR-0005): original no bucket `videosOriginais` por multipart direto do
 * navegador, worker FFmpeg pela fila, HLS AES-128 no bucket `hls`, token HMAC na entrega.
 */

const id = z.uuid("Identificador inválido.");
const TABELA = "produtos_modulos_aulas_videos";
const MSG_NAO_ENCONTRADO = "Vídeo não encontrado. Recarregue a página.";

export const esquemaPedidoEnvio = z.strictObject({
  aulaId: id,
  nome: z.string().trim().min(1).max(200),
  mime: z.string().trim().max(100),
  tamanho: z.number().int(),
  substituir: z.boolean(),
});

export const esquemaReaproveitar = z.strictObject({ aulaId: id, videoOrigemId: id, substituir: z.boolean() });

export const esquemaPartes = z.array(z.number().int().min(1).max(10_000)).min(1).max(50);

export const esquemaConclusao = z.strictObject({
  partes: z
    .array(z.strictObject({ numero: z.number().int().min(1).max(10_000), etag: z.string().regex(/^"?[\w-]{1,100}"?$/, "ETag inválida.") }))
    .min(1)
    .max(10_000),
});

export const esquemaEventoVideo = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("video.processando"), videoId: id, tentativa: z.number().int().positive() }),
  z.strictObject({
    tipo: z.literal("video.pronto"),
    videoId: id,
    tentativa: z.number().int().positive(),
    duracaoSeg: z.number().positive(),
    resolucoes: z.array(z.string().regex(/^\d{3,4}p$/)).min(1),
    prefixoHls: z.string().startsWith("criadores/"),
    thumbChave: z.string().startsWith("criadores/"),
    cpuSeg: z.number().nonnegative().nullable(),
    log: z.string(),
  }),
  z.strictObject({
    tipo: z.literal("video.falhou"),
    videoId: id,
    tentativa: z.number().int().positive(),
    erro: z.string().max(500),
    log: z.string(),
    definitivo: z.boolean(),
  }),
]);

/** Rotas do app para o player (playlist reescrita e chave; segmentos redirecionam ao storage). */
export const rotasVideo = {
  master: (videoId: string) => `/api/video/${videoId}/hls/master.m3u8`,
  chave: (videoId: string) => `/api/video/${videoId}/chave`,
};

/** Parte pura de `tokenDeReproducao`: assina e monta as URLs. */
export function montarReproducao(
  ids: { videoId: string; criadorId: string; usuarioId: string; sessaoId: string },
  agoraMs: number = Date.now(),
  segredo?: string,
): Reproducao {
  const exp = expiracaoPadrao(agoraMs);
  const token = assinarToken({ ...ids, exp }, segredo);
  return {
    videoId: ids.videoId,
    sessaoId: ids.sessaoId,
    urlMaster: comToken(rotasVideo.master(ids.videoId), token),
    urlChave: rotasVideo.chave(ids.videoId),
    token,
    expiraEm: new Date(exp * 1000).toISOString(),
  };
}

type LinhaVideo = typeof videos.$inferSelect;

/** Pasta do vídeo nos buckets: criadores/<criador>/videos/<id>. */
export const pastaDoVideo = (criadorId: string, videoId: string) => chaveDoCriador(criadorId, "videos", videoId);

/**
 * Depois do commit: tira do storage o que era do vídeo descartado (multipart aberto, original e
 * HLS). Original e pasta HLS que OUTRO vídeo vivo ainda usa (aula que reaproveitou o vídeo)
 * ficam. Best-effort: o registro já está excluído; falha vira log CRITICAL para limpeza manual.
 */
export async function limparObjetosDoVideo(v: Pick<LinhaVideo, "id" | "criador_id" | "chave_origem" | "upload_id" | "prefixo_hls">): Promise<void> {
  const criadorId = v.criador_id;
  const pastas = [...new Set([pastaDoVideo(criadorId, v.id), ...(v.prefixo_hls ? [v.prefixo_hls] : [])])];
  let emUso: { chave_origem: string; prefixo_hls: string | null }[];
  try {
    emUso = await db
      .select({ chave_origem: videos.chave_origem, prefixo_hls: videos.prefixo_hls })
      .from(videos)
      .where(and(eq(videos.criador_id, criadorId), ne(videos.id, v.id), vivos(videos), or(eq(videos.chave_origem, v.chave_origem), inArray(videos.prefixo_hls, pastas))));
  } catch (e) {
    // Sem saber quem mais usa, não apaga nada (apagar errado tira o vídeo de outra aula).
    console.error("CRITICAL [video] não conferiu o uso compartilhado; objetos do vídeo descartado ficaram:", v.id, e);
    return;
  }
  const passos: Promise<unknown>[] = pastas
    .filter((pasta) => !emUso.some((o) => o.prefixo_hls === pasta))
    .map((pasta) => apagarPrefixo({ bucket: "hls", criadorId, chave: pasta }));
  if (!emUso.some((o) => o.chave_origem === v.chave_origem)) passos.push(apagarObjeto({ bucket: "videosOriginais", criadorId, chave: v.chave_origem }));
  if (v.upload_id) passos.push(abortarEnvioMultipart({ bucket: "videosOriginais", criadorId, chave: v.chave_origem, uploadId: v.upload_id }));
  const r = await Promise.allSettled(passos);
  for (const f of r) if (f.status === "rejected") console.error("CRITICAL [video] objeto do vídeo descartado não apagado:", v.id, f.reason);
}

/** Trava a aula viva do criador (troca de vídeo concorrente na mesma aula espera). */
async function travarAula(tx: Transacao, criadorId: string, aulaId: string) {
  const [aula] = await tx
    .select({ id: produtos_modulos_aulas.id, titulo: produtos_modulos_aulas.titulo })
    .from(produtos_modulos_aulas)
    .where(and(eq(produtos_modulos_aulas.id, aulaId), eq(produtos_modulos_aulas.criador_id, criadorId), vivos(produtos_modulos_aulas)))
    .for("update");
  if (!aula) throw new ErroDeNegocio("Aula não encontrada. Recarregue a página.");
  return aula;
}

/**
 * Com a aula travada: exclui o vídeo vivo dela se a troca foi confirmada (`substituir`), ou
 * recusa. Devolve o excluído para limpar o storage depois do commit.
 */
async function tirarVideoAtual(tx: Transacao, ctx: ContextoVideo, aula: { id: string; titulo: string }, substituir: boolean): Promise<LinhaVideo | null> {
  const [atual] = await tx.select().from(videos).where(and(eq(videos.aula_id, aula.id), eq(videos.criador_id, ctx.criadorId), vivos(videos)));
  if (!atual) return null;
  if (!substituir) throw new ErroDeNegocio("Esta aula já tem vídeo. Use “Trocar vídeo”.");
  await tx.update(videos).set(marcaDeExclusao(ctx.usuarioId)).where(eq(videos.id, atual.id));
  await registrarAuditoria(tx, {
    userId: ctx.usuarioId,
    criadorId: ctx.criadorId,
    acao: "excluir",
    tabela: TABELA,
    registroId: atual.id,
    detalhes: `Trocou o vídeo da aula "${aula.titulo}": "${atual.nome_original}" saiu`,
    dadosAnteriores: { situacao: atual.situacao, chave_origem: atual.chave_origem, prefixo_hls: atual.prefixo_hls },
  });
  return atual;
}

/**
 * Põe de novo na fila (FALHOU, PRONTO ou PROCESSANDO parado). Mesmo jobId: nunca duplica.
 * Autor `{ sistema }` (scripts/video-reconferir.ts) segue o padrão do worker (registro.ts):
 * `modified_by` fica o atual do vídeo e a trilha sai com `user_id` nulo e o rótulo do sistema.
 */
export async function reprocessarVideo(
  criadorId: string,
  videoId: string,
  autor: { usuarioId: string } | { sistema: string },
): Promise<{ enfileirado: boolean }> {
  const v = await videoVivo(criadorId, id.parse(videoId));
  if (!v || v.situacao === "ENVIANDO") throw new ErroDeNegocio(MSG_NAO_ENCONTRADO);
  const usuarioId = "usuarioId" in autor ? autor.usuarioId : null;
  await db.transaction(async (tx) => {
    await tx
      .update(videos)
      .set({ situacao: "PROCESSANDO", erro: null, updated_at: new Date(), modified_by: usuarioId ?? v.modified_by })
      .where(and(eq(videos.id, v.id), vivos(videos)));
    await registrarAuditoria(tx, {
      userId: usuarioId,
      criadorId,
      acao: "atualizar",
      tabela: TABELA,
      registroId: v.id,
      detalhes: "sistema" in autor ? `${autor.sistema}: pediu o reprocessamento do vídeo "${v.nome_original}"` : `Pediu o reprocessamento do vídeo "${v.nome_original}"`,
      dadosAnteriores: { situacao: v.situacao, erro: v.erro },
      dadosNovos: { situacao: "PROCESSANDO" },
    });
  });
  return { enfileirado: await enfileirarComPrazo(v.id) };
}

export class ProvedorProprio implements ProvedorVideo {
  async criarEnvio(ctx: ContextoVideo, pedido: PedidoEnvio): Promise<Envio> {
    const p = esquemaPedidoEnvio.parse(pedido);
    const { mime, extensao } = validarEnvioVideo(p);
    const videoId = randomUUID();
    const chaveOrigem = chaveDoCriador(ctx.criadorId, "videos", videoId, `original.${extensao}`);
    const { uploadId } = await iniciarEnvioMultipart({ bucket: "videosOriginais", criadorId: ctx.criadorId, chave: chaveOrigem, mime });

    let anterior: LinhaVideo | null = null;
    try {
      await db.transaction(async (tx) => {
        const aula = await travarAula(tx, ctx.criadorId, p.aulaId);
        anterior = await tirarVideoAtual(tx, ctx, aula, p.substituir);
        await tx.insert(videos).values({
          id: videoId,
          criador_id: ctx.criadorId,
          aula_id: aula.id,
          situacao: "ENVIANDO",
          nome_original: p.nome,
          mime,
          tamanho_bytes: p.tamanho,
          chave_origem: chaveOrigem,
          upload_id: uploadId,
          chave_cifrada: cifrarChave(gerarChaveVideo(), videoId),
          modified_by: ctx.usuarioId,
        });
        await registrarAuditoria(tx, {
          userId: ctx.usuarioId,
          criadorId: ctx.criadorId,
          acao: "criar",
          tabela: TABELA,
          registroId: videoId,
          detalhes: `Iniciou o envio do vídeo "${p.nome}" na aula "${aula.titulo}"`,
          dadosNovos: { mime, tamanho_bytes: p.tamanho, chave_origem: chaveOrigem },
        });
      });
    } catch (e) {
      await abortarEnvioMultipart({ bucket: "videosOriginais", criadorId: ctx.criadorId, chave: chaveOrigem, uploadId }).catch(() => undefined);
      throw e;
    }
    if (anterior) await limparObjetosDoVideo(anterior);
    return { videoId, tamanhoParte: TAMANHO_PARTE_VIDEO, totalPartes: totalDePartes(p.tamanho) };
  }

  /**
   * "Usar vídeo de outra aula": a aula ganha um vídeo PRONTO na hora, sem envio nem fila. O
   * registro novo aponta o MESMO original e a MESMA pasta HLS da origem (nada é copiado); a
   * chave AES do HLS é a mesma, recifrada para o id novo (AAD). Trocar ou excluir um dos dois
   * não apaga o que o outro usa (`limparObjetosDoVideo`).
   * ponytail: reprocessar a cópia depois que a origem saiu deixa a pasta HLS antiga órfã no
   * bucket (o worker grava na pasta do id novo); limpar com um varredor se isso virar volume.
   */
  async reaproveitar(ctx: ContextoVideo, pedido: unknown): Promise<{ videoId: string }> {
    const p = esquemaReaproveitar.parse(pedido);
    const videoId = randomUUID();
    let anterior: LinhaVideo | null = null;
    await db.transaction(async (tx) => {
      const aula = await travarAula(tx, ctx.criadorId, p.aulaId);
      // FOR SHARE: a troca da origem espera este commit, e a limpeza dela já enxerga a aula nova.
      const [origem] = await tx
        .select()
        .from(videos)
        .where(and(eq(videos.id, p.videoOrigemId), eq(videos.criador_id, ctx.criadorId), eq(videos.situacao, "PRONTO"), vivos(videos)))
        .for("share");
      if (!origem?.prefixo_hls) throw new ErroDeNegocio("Vídeo não encontrado ou ainda não pronto. Recarregue a página.");
      if (origem.aula_id === aula.id) throw new ErroDeNegocio("Este já é o vídeo desta aula.");
      anterior = await tirarVideoAtual(tx, ctx, aula, p.substituir);
      await tx.insert(videos).values({
        id: videoId,
        criador_id: ctx.criadorId,
        aula_id: aula.id,
        situacao: "PRONTO",
        nome_original: origem.nome_original,
        mime: origem.mime,
        tamanho_bytes: origem.tamanho_bytes,
        chave_origem: origem.chave_origem,
        prefixo_hls: origem.prefixo_hls,
        thumb_chave: origem.thumb_chave,
        chave_cifrada: cifrarChave(decifrarChave(origem.chave_cifrada, origem.id), videoId),
        duracao_seg: origem.duracao_seg,
        resolucoes: origem.resolucoes,
        processado_em: new Date(),
        modified_by: ctx.usuarioId,
      });
      // Campo de SISTEMA da aula, como no worker (registro.ts): sem `updated_at`.
      await tx.update(produtos_modulos_aulas).set({ duracao_seg: origem.duracao_seg }).where(eq(produtos_modulos_aulas.id, aula.id));
      await registrarAuditoria(tx, {
        userId: ctx.usuarioId,
        criadorId: ctx.criadorId,
        acao: "criar",
        tabela: TABELA,
        registroId: videoId,
        detalhes: `Reaproveitou o vídeo "${origem.nome_original}" de outra aula na aula "${aula.titulo}"`,
        dadosNovos: { video_origem_id: origem.id, aula_origem_id: origem.aula_id, chave_origem: origem.chave_origem, prefixo_hls: origem.prefixo_hls },
      });
    });
    const a = anterior as LinhaVideo | null;
    if (a) await limparObjetosDoVideo(a);
    // Aula nova para os matriculados, como no fim do processamento (idempotente, nunca lança).
    await notificarAulaNova(ctx.criadorId, p.aulaId, ctx.usuarioId);
    return { videoId };
  }

  /** URLs das partes (até 50 por pedido, 1 h): só do vídeo deste criador ainda em ENVIANDO. */
  async assinarPartes(ctx: ContextoVideo, videoId: string, partes: unknown): Promise<{ numero: number; url: string }[]> {
    const numeros = esquemaPartes.parse(partes);
    const v = await videoVivo(ctx.criadorId, id.parse(videoId));
    if (!v || v.situacao !== "ENVIANDO" || !v.upload_id) throw new ErroDeNegocio(MSG_NAO_ENCONTRADO);
    if (numeros.some((n) => n > totalDePartes(v.tamanho_bytes))) throw new ErroDeNegocio("Parte fora do arquivo.");
    return assinarPartesMultipart({ bucket: "videosOriginais", criadorId: ctx.criadorId, chave: v.chave_origem, uploadId: v.upload_id, partes: numeros });
  }

  async concluirEnvio(ctx: ContextoVideo, videoId: string, dadosDoEnvio: unknown): Promise<{ enfileirado: boolean }> {
    const { partes } = esquemaConclusao.parse(dadosDoEnvio);
    const v = await videoVivo(ctx.criadorId, id.parse(videoId));
    if (!v || v.situacao !== "ENVIANDO" || !v.upload_id) throw new ErroDeNegocio(MSG_NAO_ENCONTRADO);
    const total = totalDePartes(v.tamanho_bytes);
    const numeros = new Set(partes.map((p) => p.numero));
    if (numeros.size !== total || partes.some((p) => p.numero > total)) throw new ErroDeNegocio("Envio incompleto: faltam partes do vídeo.");

    const alvo = { bucket: "videosOriginais" as const, criadorId: ctx.criadorId, chave: v.chave_origem };
    await concluirEnvioMultipart({ ...alvo, uploadId: v.upload_id, partes });
    const real = await cabecalhoDoObjeto(alvo);
    const confere = real !== null && real.tamanho === v.tamanho_bytes;

    await db.transaction(async (tx) => {
      const [linha] = await tx
        .update(videos)
        .set(confere ? { situacao: "PROCESSANDO", upload_id: null, erro: null, updated_at: new Date(), modified_by: ctx.usuarioId } : marcaDeExclusao(ctx.usuarioId))
        .where(and(eq(videos.id, v.id), eq(videos.situacao, "ENVIANDO"), vivos(videos)))
        .returning({ id: videos.id });
      if (!linha) throw new ErroDeNegocio(MSG_NAO_ENCONTRADO);
      await registrarAuditoria(tx, {
        userId: ctx.usuarioId,
        criadorId: ctx.criadorId,
        acao: confere ? "atualizar" : "excluir",
        tabela: TABELA,
        registroId: v.id,
        detalhes: confere ? `Concluiu o envio do vídeo "${v.nome_original}" (na fila)` : `Recusou o envio do vídeo "${v.nome_original}": tamanho diferente do declarado`,
        dadosAnteriores: { situacao: v.situacao },
        dadosNovos: confere ? { situacao: "PROCESSANDO" } : { real },
      });
    });
    if (!confere) {
      await limparObjetosDoVideo({ ...v, upload_id: null });
      throw new ErroDeNegocio("O vídeo não chegou inteiro ao armazenamento. Envie de novo.");
    }
    return { enfileirado: await enfileirarComPrazo(v.id) };
  }

  /** Desiste do envio em andamento: aborta o multipart e exclui o registro. */
  async cancelarEnvio(ctx: ContextoVideo, videoId: string): Promise<void> {
    const v = await videoVivo(ctx.criadorId, id.parse(videoId));
    if (!v || v.situacao !== "ENVIANDO") throw new ErroDeNegocio(MSG_NAO_ENCONTRADO);
    await db.transaction(async (tx) => {
      const [linha] = await tx
        .update(videos)
        .set(marcaDeExclusao(ctx.usuarioId))
        .where(and(eq(videos.id, v.id), eq(videos.situacao, "ENVIANDO"), vivos(videos)))
        .returning({ id: videos.id });
      if (!linha) throw new ErroDeNegocio(MSG_NAO_ENCONTRADO);
      await registrarAuditoria(tx, {
        userId: ctx.usuarioId,
        criadorId: ctx.criadorId,
        acao: "excluir",
        tabela: TABELA,
        registroId: v.id,
        detalhes: `Cancelou o envio do vídeo "${v.nome_original}"`,
      });
    });
    await limparObjetosDoVideo(v);
  }

  /** Botão "Reprocessar" do estúdio: a regra única `reprocessarVideo`, com a pessoa da sessão. */
  async reprocessar(ctx: ContextoVideo, videoId: string): Promise<{ enfileirado: boolean }> {
    return reprocessarVideo(ctx.criadorId, videoId, { usuarioId: ctx.usuarioId });
  }

  async tokenDeReproducao(ctx: ContextoVideo & { sessaoLoginId: string; ip: string; userAgent: string }, aulaId: string): Promise<Reproducao> {
    const v = await videoVivoDaAula(ctx.criadorId, id.parse(aulaId));
    if (!v || v.situacao !== "PRONTO") throw new ErroDeNegocio("O vídeo desta aula ainda não está pronto.");
    const sessaoId = await abrirSessaoReproducao({ ...ctx, videoId: v.id });
    return montarReproducao({ videoId: v.id, criadorId: ctx.criadorId, usuarioId: ctx.usuarioId, sessaoId });
  }

  /** Novo token para a MESMA sessão. Sessão encerrada pelo limite de telas = recusa. */
  async renovarReproducao(ctx: ContextoVideo, videoId: string, sessaoId: string): Promise<Reproducao> {
    const s = { videoId: id.parse(videoId), sessaoId: id.parse(sessaoId), criadorId: ctx.criadorId, usuarioId: ctx.usuarioId };
    if (!(await renovarSessaoReproducao(s))) throw new ErroDeNegocio("A reprodução foi aberta em outra tela. Recarregue para assistir aqui.");
    return montarReproducao(s);
  }

  async aoReceberEvento(evento: unknown): Promise<boolean> {
    return aplicarEvento(esquemaEventoVideo.parse(evento) as EventoVideo);
  }

  async situacao(criadorId: string, videoId: string): Promise<EstadoVideo | null> {
    const v = await videoVivo(criadorId, id.parse(videoId));
    return v ? estadoDoVideo(v) : null;
  }
}

export const provedorVideo = new ProvedorProprio();
