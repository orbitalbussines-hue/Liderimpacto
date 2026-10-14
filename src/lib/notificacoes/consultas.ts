import "server-only";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { TipoNotificacao } from "@/lib/db/schema/_enums";
import { criadores_membros_notificacoes as n } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { RETENCAO_DIAS, TETO_CONTADOR, linkDaNotificacao, textoDaNotificacao } from "./regras";

/**
 * LEITURA e marcação das notificações de UM membro (o vínculo do HOST: `membroId` da sessão, nunca
 * de parâmetro). Ignora arquivadas e as mais velhas que a retenção (mesmo antes do arquivamento).
 */

const limiteDaRetencao = (agora: Date) => new Date(agora.getTime() - RETENCAO_DIAS * 86_400_000);
const doMembro = (criadorId: string, membroId: string, agora: Date) =>
  and(eq(n.criador_id, criadorId), eq(n.membro_id, membroId), vivos(n), isNull(n.arquivada_em), gte(n.evento_em, limiteDaRetencao(agora)))!;

export interface NotificacaoDaLista {
  id: string;
  tipo: TipoNotificacao;
  /** Frase pronta ("Ana e mais 3 curtiram sua publicação."). */
  texto: string;
  href: string;
  lida: boolean;
  /** Último evento (a agregação de curtidas atualiza). */
  em: Date;
}

export interface PaginaDeNotificacoes {
  itens: NotificacaoDaLista[];
  /** Passe de volta para a próxima página; `null` = acabou. */
  proximoCursor: string | null;
}

const cursorDe = (em: Date, id: string) => Buffer.from(`${em.toISOString()}|${id}`).toString("base64url");
function lerCursor(c: string | null | undefined): { em: Date; id: string } | null {
  if (!c || c.length > 120) return null;
  const [em, id] = Buffer.from(c, "base64url").toString("utf8").split("|");
  const data = new Date(em ?? "");
  return Number.isNaN(data.getTime()) || !/^[0-9a-f-]{36}$/i.test(id ?? "") ? null : { em: data, id };
}

/** Lista paginada (mais recente primeiro), 20 por página. */
export async function notificacoesDoMembro(
  criadorId: string,
  membroId: string,
  o: { cursor?: string | null; limite?: number } = {},
  agora = new Date(),
): Promise<PaginaDeNotificacoes> {
  const limite = Math.min(Math.max(o.limite ?? 20, 1), 50);
  const c = lerCursor(o.cursor);
  const linhas = await db
    .select({ id: n.id, tipo: n.tipo, dados: n.dados, total: n.total, lidaEm: n.lida_em, em: n.evento_em })
    .from(n)
    .where(and(doMembro(criadorId, membroId, agora), c ? sql`(${n.evento_em}, ${n.id}) < (${c.em}, ${c.id}::uuid)` : undefined))
    .orderBy(desc(n.evento_em), desc(n.id))
    .limit(limite + 1);
  const pagina = linhas.slice(0, limite);
  return {
    itens: pagina.map((l) => ({ id: l.id, tipo: l.tipo, texto: textoDaNotificacao(l), href: linkDaNotificacao(l), lida: l.lidaEm !== null, em: l.em })),
    proximoCursor: linhas.length > limite ? cursorDe(pagina.at(-1)!.em, pagina.at(-1)!.id) : null,
  };
}

/** Não lidas, contando até o teto (`TETO_CONTADOR + 1` = "99+"): só o índice parcial é lido. */
export async function contarNaoLidas(criadorId: string, membroId: string, agora = new Date()): Promise<number> {
  const r = await db.execute<{ total: number }>(sql`
    select count(*)::int as total from (
      select 1 from ${n}
      where ${n.membro_id} = ${membroId} and ${n.criador_id} = ${criadorId} and ${n.is_deleted} = false
        and ${n.arquivada_em} is null and ${n.lida_em} is null and ${n.evento_em} >= ${limiteDaRetencao(agora)}
      limit ${TETO_CONTADOR + 1}
    ) x`);
  return r.rows[0]?.total ?? 0;
}

/**
 * Marca como lidas (só as DESTE membro; ids de outra pessoa são ignorados). Devolve quantas mudou.
 * Sem trilha de auditoria de propósito: é a caixa de entrada da própria pessoa (ADR-0009).
 */
export async function marcarLidas(
  p: { criadorId: string; membroId: string; usuarioId: string },
  ids: readonly string[] | "todas",
  agora = new Date(),
): Promise<number> {
  const r = await db
    .update(n)
    .set({ lida_em: agora, updated_at: agora, modified_by: p.usuarioId })
    .where(and(doMembro(p.criadorId, p.membroId, agora), isNull(n.lida_em), ids === "todas" ? undefined : inArray(n.id, [...ids])))
    .returning({ id: n.id });
  return r.length;
}
