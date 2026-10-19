import "server-only";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { db, type Transacao } from "@/lib/db";
import {
  criadores_emails_descadastros as desc,
  criadores_funis,
  criadores_grupos,
  criadores_leads as l,
  criadores_membros as m,
  criadores_paginas,
  criadores_tags,
  produtos,
  usuarios as u,
} from "@/lib/db/schema";
import type { PublicoCampanha, PublicoLeads } from "@/lib/db/schema/marketing";
import { vivos } from "@/lib/db/soft-delete";
import { hashDoDestinatario } from "@/lib/email/disparos";

/**
 * PÚBLICO de campanha e reenvio (RN-221): UMA regra de quem entra, usada na contagem antes de enviar,
 * no início da campanha e no reenvio do primeiro acesso. Base = ALUNO com vínculo ATIVO e conta ativa
 * no criador; depois E entre os critérios e OU dentro de cada lista. Ids de outro criador = recusa.
 * LEADS (ADR-0023, RN-250/251): segmento à parte (página de origem, funil, tag), somado aos membros SEM
 * duplicar pessoa — dedupe pelo HMAC do e-mail, membro primeiro. Lead cujo e-mail já tem vínculo na área
 * conta como MEMBRO (entra como membro se for ALUNO ativo; senão, não entra).
 */

const lista = (ids: readonly string[]) => sql.join(ids.map((id) => sql`${id}`), sql`, `);

/** Campanha antiga (sem os campos novos) = só membros. */
export const normalizarPublico = (p: PublicoCampanha): PublicoCampanha & { membros: boolean; leads: PublicoLeads | null } => ({ ...p, membros: p.membros ?? true, leads: p.leads ?? null });

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

/** Leads vivos do criador no segmento (E entre critérios, OU dentro). Nome da tabela por extenso: vale em subconsulta. */
function condicaoDosLeads(criadorId: string, p: PublicoLeads): SQL {
  const c: SQL[] = [sql`criadores_leads.criador_id = ${criadorId}`, sql`criadores_leads.is_deleted = false`];
  if (p.paginaIds.length) c.push(sql`criadores_leads.pagina_id in (${lista(p.paginaIds)})`);
  if (p.funilIds.length) c.push(sql`criadores_leads.funil_id in (${lista(p.funilIds)})`);
  if (p.tagIds.length) c.push(sql`criadores_leads.tag_id in (${lista(p.tagIds)})`);
  return and(...c)!;
}

/** O e-mail do lead já tem vínculo vivo NESTA área (qualquer papel/situação): conta como membro. */
const leadJaEhMembro = (criadorId: string) =>
  sql`exists (select 1 from criadores_membros mm join usuarios uu on uu.id = mm.usuario_id where mm.criador_id = ${criadorId} and mm.is_deleted = false and uu.is_deleted = false and lower(uu.email) = criadores_leads.email)`;

/** Grupos, tags, cursos, páginas e funis do público são DESTE criador e estão vivos (outro criador = "não encontrado"). */
export async function conferirPublico(tx: Transacao | typeof db, criadorId: string, publico: PublicoCampanha): Promise<void> {
  const p = normalizarPublico(publico);
  type Tabela = typeof criadores_grupos | typeof criadores_tags | typeof produtos | typeof criadores_paginas | typeof criadores_funis;
  const conta = async (tabela: Tabela, ids: string[], msg: string) => {
    if (!ids.length) return;
    const linhas = await tx.select({ id: tabela.id }).from(tabela).where(and(inArray(tabela.id, ids), eq(tabela.criador_id, criadorId), vivos(tabela)));
    if (linhas.length !== new Set(ids).size) throw new ErroDeNegocio(msg);
  };
  await conta(criadores_grupos, p.grupoIds, "Grupo não encontrado.");
  await conta(criadores_tags, p.tagIds, "Tag não encontrada.");
  await conta(produtos, p.produtoIds, "Curso não encontrado.");
  if (p.leads) {
    await conta(criadores_paginas, p.leads.paginaIds, "Página não encontrada.");
    await conta(criadores_funis, p.leads.funilIds, "Funil não encontrado.");
    await conta(criadores_tags, p.leads.tagIds, "Tag não encontrada.");
  }
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

/** Um destinatário de campanha: membro OU lead, com o HMAC do e-mail (chave do dedupe). */
export type Destinatario = { tipo: "MEMBRO"; membroId: string; nome: string; email: string; hash: string } | { tipo: "LEAD"; leadId: string; nome: string; email: string; hash: string };

const SEM_FILTRO_MEMBRO: PublicoCampanha = { grupoIds: [], tagIds: [], produtoIds: [], nuncaAcessou: false };

/**
 * Destinatários da campanha AGORA, sem repetir pessoa: (1) membros do segmento de membros; (2) leads do
 * segmento que já são ALUNO ativo, como MEMBRO; (3) os demais leads (sem vínculo na área). Dedupe pelo
 * HMAC do e-mail, nessa ordem. ponytail: carrega tudo em memória; paginar acima de ~50 mil pessoas.
 */
export async function destinatariosDoPublico(criadorId: string, publico: PublicoCampanha, agora = new Date()): Promise<Destinatario[]> {
  const p = normalizarPublico(publico);
  const membros = p.membros ? await pessoasDoPublico(criadorId, p, agora) : [];
  const viraramMembro = p.leads
    ? await pessoasDoPublico(criadorId, SEM_FILTRO_MEMBRO, agora, sql`exists (select 1 from criadores_leads where ${condicaoDosLeads(criadorId, p.leads)} and criadores_leads.email = lower(${u.email}))`)
    : [];
  const leads = p.leads
    ? await db
        .select({ id: l.id, nome: l.nome, email: l.email })
        .from(l)
        .where(and(condicaoDosLeads(criadorId, p.leads), sql`not ${leadJaEhMembro(criadorId)}`))
        .orderBy(asc(l.created_at), asc(l.id))
    : [];
  const vistos = new Set<string>();
  const saida: Destinatario[] = [];
  const entra = (d: Destinatario) => {
    if (vistos.has(d.hash)) return;
    vistos.add(d.hash);
    saida.push(d);
  };
  for (const x of [...membros, ...viraramMembro]) entra({ tipo: "MEMBRO", membroId: x.membroId, nome: x.nome, email: x.email, hash: hashDoDestinatario(x.email) });
  for (const x of leads) entra({ tipo: "LEAD", leadId: x.id, nome: x.nome, email: x.email, hash: hashDoDestinatario(x.email) });
  return saida;
}

/** HMACs descadastrados neste criador, entre os pedidos. */
export async function descadastradosEntre(criadorId: string, hashes: readonly string[]): Promise<Set<string>> {
  if (!hashes.length) return new Set();
  const linhas = await db
    .select({ hash: desc.destinatario_hash })
    .from(desc)
    .where(and(eq(desc.criador_id, criadorId), inArray(desc.destinatario_hash, [...hashes]), vivos(desc)));
  return new Set(linhas.map((x) => x.hash));
}

export interface ContagemPublico {
  total: number;
  descadastrados: number;
  receberao: number;
  /** Dos que receberão: quantos são membros e quantos leads (RN-251). */
  membros: number;
  leads: number;
}

/** Contagem ANTES de enviar: quantos estão no público e quantos receberão (descadastrados ficam de fora). */
export async function contarPublico(criadorId: string, p: PublicoCampanha, agora = new Date()): Promise<ContagemPublico> {
  await conferirPublico(db, criadorId, p);
  const pessoas = await destinatariosDoPublico(criadorId, p, agora);
  const fora = await descadastradosEntre(criadorId, pessoas.map((x) => x.hash));
  const recebem = pessoas.filter((x) => !fora.has(x.hash));
  const leads = recebem.filter((x) => x.tipo === "LEAD").length;
  return { total: pessoas.length, descadastrados: pessoas.length - recebem.length, receberao: recebem.length, membros: recebem.length - leads, leads };
}
