import "server-only";
import { and, eq, gt, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, type Transacao } from "@/lib/db";
import { criadores_canais, criadores_membros_silenciamentos } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import type { PapelCriador } from "@/lib/db/schema/_enums";
import type { QuemPede } from "@/lib/progresso/visao";

/**
 * Peças SQL da comunidade: QUEM VÊ O CANAL (RN-130) num lugar só — o feed, o post, o comentário,
 * a curtida, a denúncia e o envio de notificação em massa usam esta mesma condição.
 */

interface ColunasCanal {
  acesso: AnyPgColumn | SQL;
  grupo_id: AnyPgColumn | SQL;
  produto_id: AnyPgColumn | SQL;
}

/**
 * O membro (`membroId`, `papel`, expressões SQL) vê o canal? Equipe (DONO/ADMIN, e SUPER_ADMIN
 * como DONO) vê todos. ALUNO: TODOS; GRUPO = está no grupo (vivo); PRODUTO = matrícula valendo
 * agora; EQUIPE nunca.
 */
export function veCanalSql(c: ColunasCanal, membroId: SQL, papel: SQL, agora: Date): SQL<boolean> {
  return sql<boolean>`(
    ${papel} in ('DONO', 'ADMIN')
    or ${c.acesso} = 'TODOS'
    or (${c.acesso} = 'GRUPO' and exists (
      select 1 from criadores_grupos_membros gm join criadores_grupos g on g.id = gm.grupo_id
      where gm.grupo_id = ${c.grupo_id} and gm.membro_id = ${membroId} and gm.is_deleted = false and g.is_deleted = false))
    or (${c.acesso} = 'PRODUTO' and exists (
      select 1 from produtos_matriculas pm
      where pm.produto_id = ${c.produto_id} and pm.membro_id = ${membroId} and pm.is_deleted = false
        and pm.status = 'ATIVA' and (pm.expira_em is null or pm.expira_em > ${agora})))
  )`;
}

/** `veCanalSql` para quem pede (a linha de `criadores_canais` na consulta). */
export const quemVeCanalSql = (q: QuemPede, agora: Date): SQL<boolean> =>
  veCanalSql(criadores_canais, q.membro.id ? sql`${q.membro.id}::uuid` : sql`null::uuid`, sql`${q.membro.papel}`, agora);

/** Canal vivo do criador do HOST que quem pede vê. */
export const canalVisivelSql = (q: QuemPede, agora: Date): SQL =>
  and(eq(criadores_canais.criador_id, q.criador.id), vivos(criadores_canais), quemVeCanalSql(q, agora))!;

/** Conteúdo oculto pela moderação: só a equipe e o próprio autor veem (com o motivo). */
export function ocultoVisivelSql(q: QuemPede, t: { oculto_em: AnyPgColumn; autor_membro_id: AnyPgColumn }): SQL<boolean> {
  if (q.membro.papel !== "ALUNO") return sql<boolean>`true`;
  return sql<boolean>`(${t.oculto_em} is null or ${t.autor_membro_id} = ${q.membro.id ?? null})`;
}

/** Até quando o membro está silenciado (nulo = não está). */
export async function silenciadoAte(criadorId: string, membroId: string, agora: Date, exec: Transacao | typeof db = db): Promise<Date | null> {
  const s = criadores_membros_silenciamentos;
  const [l] = await exec
    .select({ ate: s.ate })
    .from(s)
    .where(and(eq(s.criador_id, criadorId), eq(s.membro_id, membroId), vivos(s), gt(s.ate, agora)));
  return l?.ate ?? null;
}

/**
 * Serializa as escritas de UM membro na comunidade (post, comentário, envio): a contagem da janela
 * do limite de frequência e a inserção não correm em paralelo (dois cliques = uma conta certa).
 */
export async function travarMembro(tx: Transacao, membroId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`comunidade:${membroId}`}, 0))`);
}

/** Quem escreve na comunidade: precisa de VÍNCULO no criador (SUPER_ADMIN sem vínculo só lê). */
export interface Participante {
  criadorId: string;
  usuarioId: string;
  membroId: string;
  papel: PapelCriador;
  /** Nome completo (a notificação usa só o primeiro). */
  nome: string;
}

export const quemPedeDe = (p: Participante): QuemPede => ({ usuario: { id: p.usuarioId }, criador: { id: p.criadorId }, membro: { id: p.membroId, papel: p.papel } });

/** Quem modera (DONO/ADMIN, ou SUPER_ADMIN sem vínculo: `membroId` nulo). */
export interface Moderador {
  criadorId: string;
  usuarioId: string;
  membroId: string | null;
  nome: string;
}
