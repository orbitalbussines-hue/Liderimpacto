import "server-only";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { urlDeLeitura, type UrlDeEnvio } from "@/lib/armazenamento/cliente";
import { confirmarEnvio, iniciarEnvio } from "@/lib/armazenamento/envio";
import { db } from "@/lib/db";
import { FINALIDADES_ARQUIVO_COMUNIDADE } from "@/lib/db/schema/_enums";
import { arquivos, criadores_canais as canais, criadores_canais_posts as posts, criadores_canais_posts_anexos as anexos } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import type { QuemPede } from "@/lib/progresso/visao";
import { finalidadeDoAnexo, JANELA_LIMITE_MIN, LIMITE_ENVIOS_JANELA, MSG_LIMITE } from "./regras";
import { canalVisivelSql, ocultoVisivelSql, type Participante } from "./sql";

/**
 * Anexos da comunidade (RN-131): qualquer membro com vínculo envia IMAGEM (JPG/PNG/WebP até 5 MB)
 * ou PDF (até 20 MB) direto ao storage (mesmo fluxo de 3 tempos do catálogo). Só quem enviou usa o
 * arquivo, e só num post (`publicar` confere). O download do PDF é uma URL curta assinada, depois de
 * conferir que quem pede VÊ o post.
 */

const TIPOS_ACEITOS = "Envie imagem (JPG, PNG ou WebP até 5 MB) ou PDF (até 20 MB).";

export async function iniciarEnvioDeAnexo(p: Participante, a: { nome: string; mime: string; tamanho: number }, agora = new Date()): Promise<{ arquivoId: string; envio: UrlDeEnvio }> {
  const finalidade = finalidadeDoAnexo(a.mime);
  if (!finalidade) throw new ErroDeNegocio(`Tipo de arquivo não aceito. ${TIPOS_ACEITOS}`);
  // ponytail: contagem sem trava (corrida de 2 envios simultâneos passa 1 a mais); o teto é de abuso, não de negócio.
  const desde = new Date(agora.getTime() - JANELA_LIMITE_MIN * 60_000);
  const [r] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(arquivos)
    .where(and(eq(arquivos.criador_id, p.criadorId), eq(arquivos.modified_by, p.usuarioId), inArray(arquivos.finalidade, [...FINALIDADES_ARQUIVO_COMUNIDADE]), gt(arquivos.created_at, desde)));
  if ((r?.total ?? 0) >= LIMITE_ENVIOS_JANELA) throw new ErroDeNegocio(MSG_LIMITE);
  return iniciarEnvio({ criadorId: p.criadorId, usuarioId: p.usuarioId, finalidade, nome: a.nome, mime: a.mime, tamanho: a.tamanho });
}

export async function confirmarEnvioDeAnexo(p: Participante, arquivoId: string) {
  const a = await confirmarEnvio({ criadorId: p.criadorId, usuarioId: p.usuarioId, arquivoId, finalidades: FINALIDADES_ARQUIVO_COMUNIDADE, somenteDoAutor: true });
  return { arquivoId: a.arquivoId, nome: a.nome, tamanho: a.tamanho, tipo: a.finalidade === "COMUNIDADE_PDF" ? ("PDF" as const) : ("IMAGEM" as const) };
}

/** URL curta (5 min) para baixar/abrir o anexo de um post que quem pede vê. `null` = não encontrado. */
export async function linkDoAnexo(q: QuemPede, anexoId: string, agora = new Date()): Promise<string | null> {
  const [a] = await db
    .select({ chave: arquivos.chave, nome: arquivos.nome_original })
    .from(anexos)
    .innerJoin(arquivos, and(eq(arquivos.id, anexos.arquivo_id), vivos(arquivos)))
    .innerJoin(posts, and(eq(posts.id, anexos.post_id), vivos(posts)))
    .innerJoin(canais, eq(canais.id, posts.canal_id))
    .where(and(eq(anexos.id, anexoId), eq(anexos.criador_id, q.criador.id), vivos(anexos), canalVisivelSql(q, agora), ocultoVisivelSql(q, posts)));
  if (!a) return null;
  return urlDeLeitura({ bucket: "arquivos", criadorId: q.criador.id, chave: a.chave, nomeDownload: a.nome });
}
