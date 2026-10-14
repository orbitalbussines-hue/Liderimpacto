import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, type Transacao } from "@/lib/db";
import { criadores_grupos, criadores_vitrines as vitrines, criadores_vitrines_versoes as versoes, produtos, produtos_matriculas, produtos_modulos, produtos_modulos_aulas, usuarios } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { configPadrao, configVitrineSchema, type ConfigVitrine, type CursoPrincipal } from "./config";

/**
 * Leituras do construtor (SEM cache): rascunho, versões, a publicada e o rascunho padrão. A vitrine
 * do aluno lê a publicada pelo cache por criador (`configPublicada`, cache.ts). Toda leitura filtra
 * o criador do HOST (o chamador já conferiu sessão e papel).
 */

type Exec = Transacao | typeof db;

/** JSON do banco → config. Inválido (schema evoluiu) = null com log; quem chama cai no padrão. */
export function configDoBanco(json: unknown, onde: string): ConfigVitrine | null {
  const r = configVitrineSchema.safeParse(json);
  if (!r.success) console.error(`[vitrine] config inválida em ${onde}:`, r.error.issues[0]);
  return r.success ? r.data : null;
}

/**
 * Curso principal (rascunho inicial): o CURSO publicado com mais matrículas vivas; empate, o
 * publicado primeiro. Sem curso: o produto publicado mais antigo; nada publicado: null.
 */
export async function cursoPrincipal(criadorId: string): Promise<CursoPrincipal | null> {
  const matriculas = sql<number>`(select count(*)::int from ${produtos_matriculas} pm where pm.produto_id = ${produtos.id} and pm.is_deleted = false)`;
  const [p] = await db
    .select({ id: produtos.id, titulo: produtos.titulo, descricao: produtos.descricao })
    .from(produtos)
    .where(and(eq(produtos.criador_id, criadorId), vivos(produtos), eq(produtos.status, "PUBLICADO")))
    .orderBy(sql`${produtos.tipo} = 'CURSO' desc`, desc(matriculas), asc(produtos.publicado_em))
    .limit(1);
  return p ?? null;
}

export const rascunhoPadrao = async (criadorId: string) => configPadrao(await cursoPrincipal(criadorId));

/** Última versão publicada (sem cache): número, config, quando e por quem. */
export async function publicadaAgora(criadorId: string, exec: Exec = db) {
  const [v] = await exec
    .select({ numero: versoes.numero, config: versoes.config, publicadaEm: versoes.publicada_em, publicadaPor: usuarios.nome })
    .from(versoes)
    .innerJoin(usuarios, eq(usuarios.id, versoes.publicada_por))
    .where(and(eq(versoes.criador_id, criadorId), vivos(versoes)))
    .orderBy(desc(versoes.numero))
    .limit(1);
  if (!v) return null;
  const config = configDoBanco(v.config, `versão ${v.numero}`);
  return config ? { ...v, config } : null;
}

/** Rascunho vivo do criador (ou null: nunca salvo). */
export async function rascunhoAtual(criadorId: string, exec: Exec = db) {
  const [r] = await exec.select().from(vitrines).where(and(eq(vitrines.criador_id, criadorId), vivos(vitrines)));
  return r ?? null;
}

/** O que o construtor edita: o rascunho salvo; senão a publicada; senão o padrão materializado. */
export async function rascunhoEfetivo(criadorId: string): Promise<ConfigVitrine> {
  const linha = await rascunhoAtual(criadorId);
  return (linha && configDoBanco(linha.rascunho, "rascunho")) || (await publicadaAgora(criadorId))?.config || (await rascunhoPadrao(criadorId));
}

/** Histórico (mais nova primeiro). */
export async function versoesDaVitrine(criadorId: string) {
  return db
    .select({ numero: versoes.numero, publicadaEm: versoes.publicada_em, publicadaPor: usuarios.nome })
    .from(versoes)
    .innerJoin(usuarios, eq(usuarios.id, versoes.publicada_por))
    .where(and(eq(versoes.criador_id, criadorId), vivos(versoes)))
    .orderBy(desc(versoes.numero));
}

/** Rótulos das referências da config (o construtor mostra títulos, não ids). */
export async function rotulosDasReferencias(criadorId: string, ids: { produtos: string[]; aulas: string[] }) {
  const [ps, as] = await Promise.all([
    ids.produtos.length
      ? db
          .select({ id: produtos.id, titulo: produtos.titulo })
          .from(produtos)
          .where(and(eq(produtos.criador_id, criadorId), vivos(produtos), inArray(produtos.id, ids.produtos)))
      : [],
    ids.aulas.length
      ? db
          .select({ id: produtos_modulos_aulas.id, titulo: produtos_modulos_aulas.titulo, curso: produtos.titulo })
          .from(produtos_modulos_aulas)
          .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
          .innerJoin(produtos, eq(produtos.id, produtos_modulos.produto_id))
          .where(and(eq(produtos_modulos_aulas.criador_id, criadorId), vivos(produtos_modulos_aulas), inArray(produtos_modulos_aulas.id, ids.aulas)))
      : [],
  ]);
  return Object.fromEntries([...ps.map((p) => [p.id, p.titulo]), ...as.map((a) => [a.id, `${a.titulo} · ${a.curso}`])]) as Record<string, string>;
}

/** Opções do construtor: cursos (alvo de botão e item manual) e grupos (quem vê). */
export async function opcoesDoConstrutor(criadorId: string) {
  const [cursos, grupos] = await Promise.all([
    db
      .select({ id: produtos.id, titulo: produtos.titulo, status: produtos.status })
      .from(produtos)
      .where(and(eq(produtos.criador_id, criadorId), vivos(produtos)))
      .orderBy(asc(produtos.titulo)),
    db
      .select({ id: criadores_grupos.id, nome: criadores_grupos.nome })
      .from(criadores_grupos)
      .where(and(eq(criadores_grupos.criador_id, criadorId), vivos(criadores_grupos)))
      .orderBy(asc(criadores_grupos.nome)),
  ]);
  return { cursos, grupos };
}

/** Busca de cursos e aulas para itens manuais e botões (título, até 12 de cada). */
export async function buscarConteudos(criadorId: string, termo: string) {
  const padrao = `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const [ps, as] = await Promise.all([
    db
      .select({ id: produtos.id, titulo: produtos.titulo, status: produtos.status })
      .from(produtos)
      .where(and(eq(produtos.criador_id, criadorId), vivos(produtos), sql`${produtos.titulo} ilike ${padrao}`))
      .orderBy(asc(produtos.titulo))
      .limit(12),
    db
      .select({ id: produtos_modulos_aulas.id, titulo: produtos_modulos_aulas.titulo, curso: produtos.titulo })
      .from(produtos_modulos_aulas)
      .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
      .innerJoin(produtos, eq(produtos.id, produtos_modulos.produto_id))
      .where(and(eq(produtos_modulos_aulas.criador_id, criadorId), vivos(produtos_modulos_aulas), vivos(produtos_modulos), vivos(produtos), sql`${produtos_modulos_aulas.titulo} ilike ${padrao}`))
      .orderBy(asc(produtos_modulos_aulas.titulo))
      .limit(12),
  ]);
  return [
    ...ps.map((p) => ({ tipo: "PRODUTO" as const, id: p.id, titulo: p.titulo, detalhe: p.status === "RASCUNHO" ? "Curso · rascunho" : "Curso" })),
    ...as.map((a) => ({ tipo: "AULA" as const, id: a.id, titulo: a.titulo, detalhe: `Aula · ${a.curso}` })),
  ];
}

/**
 * Tudo da tela do construtor. Sem rascunho salvo: o padrão (materializado) com `versao` nula —
 * o primeiro autosave cria a linha. `referencia` = o que o aluno vê hoje (publicada ou padrão),
 * para o indicador "Alterações não publicadas".
 */
export async function dadosDoConstrutor(criadorId: string) {
  const [linha, publicada, historico, opcoes, padrao] = await Promise.all([
    rascunhoAtual(criadorId),
    publicadaAgora(criadorId),
    versoesDaVitrine(criadorId),
    opcoesDoConstrutor(criadorId),
    rascunhoPadrao(criadorId),
  ]);
  const rascunho = (linha && configDoBanco(linha.rascunho, "rascunho")) || publicada?.config || padrao;
  return {
    rascunho,
    versao: linha ? linha.updated_at.toISOString() : null,
    publicada: publicada ? { numero: publicada.numero, publicadaEm: publicada.publicadaEm, publicadaPor: publicada.publicadaPor, config: publicada.config } : null,
    padrao,
    historico,
    opcoes,
  };
}
