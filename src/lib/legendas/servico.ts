import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { apagarObjetosDescartados, arquivoParaUsar, descartarArquivo } from "@/lib/armazenamento/arquivos";
import { gravarObjeto, lerObjeto } from "@/lib/armazenamento/cliente";
import { chaveDoCriador, chavePertenceAoCriador } from "@/lib/armazenamento/regras";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db } from "@/lib/db";
import { arquivos, produtos_modulos_aulas as aulas, produtos_modulos_aulas_legendas as legendas, produtos_modulos_aulas_videos as videos } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { LIMITES_LEGENDA, processarLegenda } from "./regras";

/**
 * Envio, troca e remoção de legenda (ADR-0013, RN-180). Quem chama já conferiu sessão e papel;
 * `criadorId` SEMPRE do host. O arquivo bruto chega pelo envio direto ao storage (ADR-0004) e só
 * o SERVIDOR o lê aqui: valida, converte (SRT -> VTT), sanitiza e grava o `.vtt` normalizado. O
 * `.vtt` de legenda trocada ou removida fica no storage (KB): o histórico guarda tempos e texto.
 */

const MSG_AULA = "Aula não encontrada nesta área. Recarregue a página.";
const MSG_ARQUIVO = "Arquivo da legenda inválido ou ainda não confirmado. Envie de novo.";

/** Lê um objeto do bucket de arquivos parando no limite (não confia no tamanho declarado). */
export async function lerObjetoLimitado(criadorId: string, chave: string, limite: number): Promise<Buffer> {
  const partes: Buffer[] = [];
  let total = 0;
  for await (const pedaco of await lerObjeto({ bucket: "arquivos", criadorId, chave })) {
    const b = Buffer.from(pedaco as Uint8Array);
    total += b.length;
    if (total > limite) throw new ErroDeNegocio("Arquivo grande demais. Envie VTT ou SRT até 2 MB.");
    partes.push(b);
  }
  return Buffer.concat(partes);
}

/** Bytes do arquivo bruto (LEGENDA, DISPONIVEL, deste criador). */
export async function lerArquivoBruto(criadorId: string, arquivoId: string): Promise<{ bytes: Buffer; nome: string }> {
  const [a] = await db
    .select({ chave: arquivos.chave, nome: arquivos.nome_original })
    .from(arquivos)
    .where(and(eq(arquivos.id, arquivoId), eq(arquivos.criador_id, criadorId), eq(arquivos.finalidade, "LEGENDA"), eq(arquivos.status, "DISPONIVEL"), vivos(arquivos)));
  if (!a || !chavePertenceAoCriador(a.chave, criadorId)) throw new ErroDeNegocio(MSG_ARQUIVO);
  return { bytes: await lerObjetoLimitado(criadorId, a.chave, LIMITES_LEGENDA.bytes), nome: a.nome };
}

export interface EnvioLegenda {
  criadorId: string;
  usuarioId: string;
  aulaId: string;
  idioma: string;
  rotulo: string;
  nome: string;
  bytes: Uint8Array;
  /** Trocar a legenda viva (na versão da tela); o idioma passa a ser o dela. */
  substituir: { legendaId: string; versao: Date } | null;
  /** Arquivo bruto da tela: conferido e descartado na mesma transação. */
  arquivoBrutoId?: string;
}

export async function gravarLegenda(p: EnvioLegenda): Promise<{ id: string }> {
  const [aula] = await db
    .select({ titulo: aulas.titulo, duracaoAula: aulas.duracao_seg, duracaoVideo: videos.duracao_seg })
    .from(aulas)
    .leftJoin(videos, and(eq(videos.aula_id, aulas.id), eq(videos.criador_id, aulas.criador_id), vivos(videos)))
    .where(and(eq(aulas.id, p.aulaId), eq(aulas.criador_id, p.criadorId), vivos(aulas)));
  if (!aula) throw new ErroDeNegocio(MSG_AULA);
  const l = processarLegenda(p.bytes, aula.duracaoVideo ?? aula.duracaoAula);

  const id = randomUUID();
  const chave = chaveDoCriador(p.criadorId, "legendas", `${id}.vtt`);
  const corpo = Buffer.from(l.vtt, "utf8");
  await gravarObjeto({ bucket: "arquivos", criadorId: p.criadorId, chave, corpo, tamanho: corpo.length, mime: "text/vtt; charset=utf-8" });
  const descartados: (string | null)[] = [];
  try {
    await db.transaction(async (tx) => {
      // Aula travada: dois envios da mesma aula não correm um contra o outro.
      const [viva] = await tx.select({ id: aulas.id }).from(aulas).where(and(eq(aulas.id, p.aulaId), eq(aulas.criador_id, p.criadorId), vivos(aulas))).for("update");
      if (!viva) throw new ErroDeNegocio(MSG_AULA);
      if (p.arquivoBrutoId) {
        await arquivoParaUsar(tx, p.criadorId, p.arquivoBrutoId, "LEGENDA");
        descartados.push(await descartarArquivo(tx, { criadorId: p.criadorId, arquivoId: p.arquivoBrutoId, autorId: p.usuarioId, motivo: "convertido em legenda" }));
      }
      let idioma = p.idioma;
      if (p.substituir) {
        const [antiga] = await tx
          .update(legendas)
          .set(marcaDeExclusao(p.usuarioId))
          .where(and(travaDeColisao(legendas, p.substituir.legendaId, p.substituir.versao), eq(legendas.criador_id, p.criadorId), eq(legendas.aula_id, p.aulaId)))
          .returning({ idioma: legendas.idioma, rotulo: legendas.rotulo, trechos: legendas.trechos, chave: legendas.chave });
        if (!antiga) throw new ErroDeNegocio(MSG_COLISAO);
        idioma = antiga.idioma;
        await registrarAuditoria(tx, {
          userId: p.usuarioId,
          criadorId: p.criadorId,
          acao: "excluir",
          tabela: "produtos_modulos_aulas_legendas",
          registroId: p.substituir.legendaId,
          detalhes: `Trocou a legenda ${antiga.idioma} da aula "${aula.titulo}" (a anterior fica no histórico)`,
          dadosAnteriores: antiga,
        });
      } else {
        const [existe] = await tx
          .select({ id: legendas.id })
          .from(legendas)
          .where(and(eq(legendas.aula_id, p.aulaId), eq(legendas.criador_id, p.criadorId), eq(legendas.idioma, idioma), vivos(legendas)));
        if (existe) throw new ErroDeNegocio(`Esta aula já tem legenda em ${idioma}. Use "Trocar" nela.`);
      }
      const dados = { idioma, rotulo: p.rotulo, nome_original: p.nome, chave, trechos: l.trechos, duracao_seg: l.duracaoSeg };
      await tx.insert(legendas).values({ id, criador_id: p.criadorId, aula_id: p.aulaId, ...dados, texto: l.texto, enviado_por: p.usuarioId, modified_by: p.usuarioId });
      // Trilha sem o conteúdo: só os metadados (o texto inteiro fica na linha).
      await registrarAuditoria(tx, {
        userId: p.usuarioId,
        criadorId: p.criadorId,
        acao: "criar",
        tabela: "produtos_modulos_aulas_legendas",
        registroId: id,
        detalhes: `Enviou a legenda ${idioma} ("${p.rotulo}", ${l.trechos} trechos) da aula "${aula.titulo}"`,
        dadosNovos: dados,
      });
    });
  } catch (e) {
    await apagarObjetosDescartados(p.criadorId, [chave]);
    throw e;
  }
  await apagarObjetosDescartados(p.criadorId, descartados);
  return { id };
}

/** Soft delete com trava; legenda de outro criador = colisão/"não encontrada" (mesma mensagem). */
export async function removerLegenda(p: { criadorId: string; usuarioId: string; legendaId: string; versao: Date }): Promise<void> {
  await db.transaction(async (tx) => {
    const [l] = await tx
      .update(legendas)
      .set(marcaDeExclusao(p.usuarioId))
      .where(and(travaDeColisao(legendas, p.legendaId, p.versao), eq(legendas.criador_id, p.criadorId)))
      .returning({ idioma: legendas.idioma, rotulo: legendas.rotulo, trechos: legendas.trechos, chave: legendas.chave, aulaId: legendas.aula_id });
    if (!l) throw new ErroDeNegocio(MSG_COLISAO);
    await registrarAuditoria(tx, {
      userId: p.usuarioId,
      criadorId: p.criadorId,
      acao: "excluir",
      tabela: "produtos_modulos_aulas_legendas",
      registroId: p.legendaId,
      detalhes: `Removeu a legenda ${l.idioma} ("${l.rotulo}") da aula (exclusão lógica)`,
      dadosAnteriores: l,
    });
  });
}
