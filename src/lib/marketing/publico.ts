import "server-only";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { db, type Transacao } from "@/lib/db";
import { criadores_emails_descadastros as desc, criadores_grupos, criadores_membros as m, criadores_tags, produtos, usuarios as u } from "@/lib/db/schema";
import type { PublicoCampanha } from "@/lib/db/schema/marketing";
import { vivos } from "@/lib/db/soft-delete";
import { hashDoDestinatario } from "@/lib/email/disparos";

/**
 * PÚBLICO de campanha e reenvio (RN-221): UMA regra de quem entra, usada na contagem antes de enviar,
 * no início da campanha e no reenvio do primeiro acesso. Base = ALUNO com vínculo ATIVO e conta ativa
 * no criador; depois E entre os critérios e OU dentro de cada lista. Ids de outro criador = recusa.
 */

const lista = (ids: readonly string[]) => sql.join(ids.map((id) => sql`${id}`), sql`, `);

export function condicaoDoPublico(criadorId: string, p: PublicoCampanha, agora = new Date()): SQL {
  const c: SQL[] = [eq(m.criador_id, criadorId), vivos(m), eq(m.status, "ATIVO"), eq(m.papel, "ALUNO"), vivos(u), eq(u.ativo, true)];
  if (p.grupoIds.length) {
    c.push(sql`exists (select 1 from criadores_grupos_membros gm where gm.membro_id = ${m.id} and gm.criador_id = ${criadorId} and gm.is_deleted = false and gm.grupo_id in (${lista(p.grupoIds)}))`);
  }
  if (p.tagIds.length) {
    c.push(sql`exists (select 1 from criadores_membros_tags mt where mt.membro_id = ${m.id} and mt.criador_id = ${criadorId} and mt.is_deleted = false and mt.tag_id in (${lista(p.tagIds)}))`);
  }
  if (p.produtoIds.length) {
    c.push(sql`exists (select 1 from produtos_matriculas pm where pm.membro_id = ${m.id} and pm.criador_id = ${criadorId} and pm.is_deleted = false
      and pm.status = 'ATIVA' and (pm.expira_em is null or pm.expira_em > ${agora}) and pm.produto_id in (${lista(p.produtoIds)}))`);
  }
  if (p.nuncaAcessou) c.push(sql`${m.ultimo_acesso_em} is null`);
  return and(...c)!;
}

/** Grupos, tags e cursos do público são DESTE criador e estão vivos (outro criador = "não encontrado"). */
export async function conferirPublico(tx: Transacao | typeof db, criadorId: string, p: PublicoCampanha): Promise<void> {
  const conta = async (tabela: typeof criadores_grupos | typeof criadores_tags | typeof produtos, ids: string[], msg: string) => {
    if (!ids.length) return;
    const linhas = await tx.select({ id: tabela.id }).from(tabela).where(and(inArray(tabela.id, ids), eq(tabela.criador_id, criadorId), vivos(tabela)));
    if (linhas.length !== new Set(ids).size) throw new ErroDeNegocio(msg);
  };
  await conta(criadores_grupos, p.grupoIds, "Grupo não encontrado.");
  await conta(criadores_tags, p.tagIds, "Tag não encontrada.");
  await conta(produtos, p.produtoIds, "Curso não encontrado.");
}

export interface PessoaDoPublico {
  membroId: string;
  usuarioId: string;
  nome: string;
  email: string;
}

/** Quem está no público AGORA (ordem estável). ponytail: carrega tudo; paginar acima de ~50 mil membros. */
export async function pessoasDoPublico(criadorId: string, p: PublicoCampanha, agora = new Date(), extra?: SQL): Promise<PessoaDoPublico[]> {
  return db
    .select({ membroId: m.id, usuarioId: u.id, nome: u.nome, email: u.email })
    .from(m)
    .innerJoin(u, eq(u.id, m.usuario_id))
    .where(and(condicaoDoPublico(criadorId, p, agora), extra))
    .orderBy(asc(m.created_at), asc(m.id));
}

/** HMACs descadastrados neste criador, entre os pedidos. */
export async function descadastradosEntre(criadorId: string, hashes: readonly string[]): Promise<Set<string>> {
  if (!hashes.length) return new Set();
  const linhas = await db
    .select({ hash: desc.destinatario_hash })
    .from(desc)
    .where(and(eq(desc.criador_id, criadorId), inArray(desc.destinatario_hash, [...hashes]), vivos(desc)));
  return new Set(linhas.map((l) => l.hash));
}

/** Contagem ANTES de enviar: quantos estão no público e quantos receberão (descadastrados ficam de fora). */
export async function contarPublico(criadorId: string, p: PublicoCampanha, agora = new Date()): Promise<{ total: number; descadastrados: number; receberao: number }> {
  await conferirPublico(db, criadorId, p);
  const pessoas = await pessoasDoPublico(criadorId, p, agora);
  const fora = await descadastradosEntre(criadorId, pessoas.map((x) => hashDoDestinatario(x.email)));
  return { total: pessoas.length, descadastrados: fora.size, receberao: pessoas.length - fora.size };
}
