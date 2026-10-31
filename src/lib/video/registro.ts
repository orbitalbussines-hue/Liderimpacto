import "server-only";
import { and, asc, eq, ne } from "drizzle-orm";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db, type Transacao } from "@/lib/db";
import { produtos, produtos_modulos, produtos_modulos_aulas, produtos_modulos_aulas_videos as videos, produtos_modulos_aulas_videos_processamentos as processamentos } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { notificarAulaNova } from "@/lib/notificacoes/gerar";
import type { EstadoVideo, EventoVideo } from "./provedor";

/**
 * Leitura e eventos do vídeo no banco (app e worker). Toda leitura filtra o criador e `vivos`.
 * Os eventos do worker são idempotentes: só valem para vídeo vivo em PROCESSANDO, então
 * evento repetido, atrasado ou de vídeo já trocado é ignorado (devolve `false`).
 */

const LIMITE_LOG = 4000;
const cauda = (texto: string) => (texto.length > LIMITE_LOG ? texto.slice(-LIMITE_LOG) : texto);

export async function videoVivo(criadorId: string, videoId: string, tx: Transacao | typeof db = db) {
  const [v] = await tx.select().from(videos).where(and(eq(videos.id, videoId), eq(videos.criador_id, criadorId), vivos(videos)));
  return v ?? null;
}

export async function videoVivoDaAula(criadorId: string, aulaId: string) {
  const [v] = await db.select().from(videos).where(and(eq(videos.aula_id, aulaId), eq(videos.criador_id, criadorId), vivos(videos)));
  return v ?? null;
}

/** Vídeos PRONTOS de outras aulas vivas do criador, para "Usar vídeo de outra aula" (curso > módulo > aula). */
export async function videosReaproveitaveis(criadorId: string, aulaId: string) {
  return db
    .select({
      videoId: videos.id,
      nomeOriginal: videos.nome_original,
      duracaoSeg: videos.duracao_seg,
      aula: produtos_modulos_aulas.titulo,
      modulo: produtos_modulos.titulo,
      curso: produtos.titulo,
    })
    .from(videos)
    .innerJoin(produtos_modulos_aulas, and(eq(produtos_modulos_aulas.id, videos.aula_id), vivos(produtos_modulos_aulas)))
    .innerJoin(produtos_modulos, and(eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id), vivos(produtos_modulos)))
    .innerJoin(produtos, and(eq(produtos.id, produtos_modulos.produto_id), vivos(produtos)))
    .where(and(eq(videos.criador_id, criadorId), eq(videos.situacao, "PRONTO"), ne(videos.aula_id, aulaId), vivos(videos)))
    .orderBy(asc(produtos.titulo), asc(produtos_modulos.ordem), asc(produtos_modulos_aulas.ordem));
}

export function estadoDoVideo(v: typeof videos.$inferSelect): EstadoVideo {
  return {
    videoId: v.id,
    situacao: v.situacao,
    nomeOriginal: v.nome_original,
    tamanhoBytes: v.tamanho_bytes,
    duracaoSeg: v.duracao_seg,
    resolucoes: v.resolucoes,
    erro: v.erro,
    tentativas: v.tentativas,
  };
}

/** Vídeo para o WORKER (sem criador do host: o job traz só o id; o criador vem da linha). */
export async function videoParaProcessar(videoId: string) {
  const [v] = await db.select().from(videos).where(and(eq(videos.id, videoId), vivos(videos)));
  return v ?? null;
}

/** Trava a linha viva em PROCESSANDO (ou nada, se trocada/excluída/já pronta). */
async function travarEmProcessamento(tx: Transacao, videoId: string) {
  const [v] = await tx
    .select()
    .from(videos)
    .where(and(eq(videos.id, videoId), eq(videos.situacao, "PROCESSANDO"), vivos(videos)))
    .for("update");
  return v ?? null;
}

async function fecharTentativa(tx: Transacao, v: typeof videos.$inferSelect, tentativa: number, dados: { situacao: "PRONTO" | "FALHOU"; log: string; cpuSeg?: number | null }) {
  const [p] = await tx
    .update(processamentos)
    .set({ situacao: dados.situacao, terminado_em: new Date(), log: cauda(dados.log), cpu_seg: dados.cpuSeg == null ? null : Math.round(dados.cpuSeg), updated_at: new Date() })
    .where(and(eq(processamentos.video_id, v.id), eq(processamentos.tentativa, tentativa), eq(processamentos.situacao, "PROCESSANDO"), vivos(processamentos)))
    .returning({ id: processamentos.id });
  return p ?? null;
}

/**
 * Aplica o evento do worker. Autor das linhas (`modified_by`) = quem pediu o processamento
 * (o `modified_by` atual do vídeo); na trilha, `user_id` nulo: quem age é o sistema.
 */
export async function aplicarEvento(e: EventoVideo): Promise<boolean> {
  let pronto: { criadorId: string; aulaId: string; autor: string } | null = null;
  const aplicado = await db.transaction(async (tx) => {
    const v = await travarEmProcessamento(tx, e.videoId);
    if (!v) return false;
    const autor = v.modified_by;

    if (e.tipo === "video.processando") {
      await tx.insert(processamentos).values({ criador_id: v.criador_id, video_id: v.id, tentativa: e.tentativa, modified_by: autor });
      await tx.update(videos).set({ tentativas: e.tentativa, updated_at: new Date() }).where(eq(videos.id, v.id));
      return true;
    }

    if (e.tipo === "video.pronto") {
      await fecharTentativa(tx, v, e.tentativa, { situacao: "PRONTO", log: e.log, cpuSeg: e.cpuSeg });
      const duracaoSeg = Math.round(e.duracaoSeg);
      await tx
        .update(videos)
        .set({
          situacao: "PRONTO",
          duracao_seg: duracaoSeg,
          resolucoes: e.resolucoes,
          prefixo_hls: e.prefixoHls,
          thumb_chave: e.thumbChave,
          erro: null,
          processado_em: new Date(),
          updated_at: new Date(),
        })
        .where(eq(videos.id, v.id));
      // Campo de SISTEMA da aula: sem `updated_at` (não invalida a edição aberta na tela).
      await tx
        .update(produtos_modulos_aulas)
        .set({ duracao_seg: duracaoSeg })
        .where(and(eq(produtos_modulos_aulas.id, v.aula_id), eq(produtos_modulos_aulas.criador_id, v.criador_id), vivos(produtos_modulos_aulas)));
      await registrarAuditoria(tx, {
        userId: null,
        criadorId: v.criador_id,
        acao: "atualizar",
        tabela: "produtos_modulos_aulas_videos",
        registroId: v.id,
        detalhes: `Worker de vídeo: "${v.nome_original}" pronto (${e.resolucoes.join(" + ")}, ${duracaoSeg} s, tentativa ${e.tentativa})`,
        dadosAnteriores: { situacao: v.situacao },
        dadosNovos: { situacao: "PRONTO", duracao_seg: duracaoSeg, resolucoes: e.resolucoes },
      });
      pronto = { criadorId: v.criador_id, aulaId: v.aula_id, autor };
      return true;
    }

    await fecharTentativa(tx, v, e.tentativa, { situacao: "FALHOU", log: `${e.erro}\n${e.log}` });
    await tx
      .update(videos)
      .set(
        e.definitivo
          ? { situacao: "FALHOU", erro: e.erro, updated_at: new Date() }
          : { erro: `Tentativa ${e.tentativa} falhou; tentando de novo. (${e.erro})`, updated_at: new Date() },
      )
      .where(eq(videos.id, v.id));
    if (e.definitivo) {
      await registrarAuditoria(tx, {
        userId: null,
        criadorId: v.criador_id,
        acao: "atualizar",
        tabela: "produtos_modulos_aulas_videos",
        registroId: v.id,
        detalhes: `Worker de vídeo: "${v.nome_original}" falhou após ${e.tentativa} tentativa(s): ${e.erro}`,
        dadosAnteriores: { situacao: v.situacao },
        dadosNovos: { situacao: "FALHOU" },
      });
    }
    return true;
  });
  // Aula nova para os matriculados: depois do commit, idempotente por aula, nunca lança (RN-134).
  const p = pronto as { criadorId: string; aulaId: string; autor: string } | null;
  if (p) await notificarAulaNova(p.criadorId, p.aulaId, p.autor);
  return aplicado;
}
