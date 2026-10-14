import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db, type Transacao } from "@/lib/db";
import type { AcessoCanal, QuemPostaCanal } from "@/lib/db/schema/_enums";
import { criadores_canais as canais, criadores_canais_posts as posts, criadores_grupos, produtos } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { violouUnico } from "@/lib/membros/vinculos";
import type { QuemPede } from "@/lib/progresso/visao";
import { CANAL_GERAL } from "./regras";
import { canalVisivelSql } from "./sql";

/**
 * Canais do criador (RN-130): leitura para o aluno (só os que ele vê) e para a equipe (todos, com
 * versão), e as escritas da equipe. `criadorId` SEMPRE do host.
 */

export const MSG_CANAL_NAO_ENCONTRADO = "Canal não encontrado.";

/** Cria o "Geral" do criador se faltar (idempotente; a migração 0007 criou o dos que já existiam). */
export async function garantirCanalGeral(exec: Transacao | typeof db, criadorId: string, autorId: string): Promise<void> {
  await exec
    .insert(canais)
    .values({ criador_id: criadorId, nome: CANAL_GERAL.nome, descricao: CANAL_GERAL.descricao, ordem: 1, padrao: true, modified_by: autorId })
    .onConflictDoNothing();
}

export interface CanalDoMembro {
  id: string;
  nome: string;
  descricao: string;
  acesso: AcessoCanal;
  quemPosta: QuemPostaCanal;
  padrao: boolean;
  /** Pode publicar aqui (avisos: só a equipe; silenciado: ninguém — ver `situacaoNaComunidade`). */
  podePublicar: boolean;
}

/** Canais que quem pede vê, na ordem (ordem, nome). */
export async function canaisDoMembro(q: QuemPede, agora = new Date()): Promise<CanalDoMembro[]> {
  const linhas = await db
    .select({ id: canais.id, nome: canais.nome, descricao: canais.descricao, acesso: canais.acesso, quemPosta: canais.quem_posta, padrao: canais.padrao })
    .from(canais)
    .where(canalVisivelSql(q, agora))
    .orderBy(asc(canais.ordem), asc(sql`lower(${canais.nome})`));
  return linhas.map((c) => ({ ...c, podePublicar: q.membro.id !== null && (c.quemPosta === "TODOS" || q.membro.papel !== "ALUNO") }));
}

/** Canal visível para quem pede (`null` = não existe neste criador ou não é para ele). */
export async function canalVisivel(q: QuemPede, canalId: string, agora = new Date(), exec: Transacao | typeof db = db) {
  const [c] = await exec
    .select({ id: canais.id, nome: canais.nome, quemPosta: canais.quem_posta })
    .from(canais)
    .where(and(eq(canais.id, canalId), canalVisivelSql(q, agora)));
  return c ?? null;
}

export interface CanalParaEditar {
  id: string;
  nome: string;
  descricao: string;
  ordem: number;
  acesso: AcessoCanal;
  grupo: { id: string; nome: string } | null;
  produto: { id: string; titulo: string } | null;
  quemPosta: QuemPostaCanal;
  padrao: boolean;
  publicacoes: number;
  versao: string;
}

/** Todos os canais vivos do criador para a tela da equipe. */
export async function canaisParaEditar(criadorId: string): Promise<CanalParaEditar[]> {
  const linhas = await db
    .select({
      id: canais.id,
      nome: canais.nome,
      descricao: canais.descricao,
      ordem: canais.ordem,
      acesso: canais.acesso,
      grupoId: canais.grupo_id,
      grupoNome: criadores_grupos.nome,
      produtoId: canais.produto_id,
      produtoTitulo: produtos.titulo,
      quemPosta: canais.quem_posta,
      padrao: canais.padrao,
      publicacoes: sql<number>`(select count(*)::int from ${posts} p where p.canal_id = ${canais.id} and p.is_deleted = false)`,
      updatedAt: canais.updated_at,
    })
    .from(canais)
    .leftJoin(criadores_grupos, eq(criadores_grupos.id, canais.grupo_id))
    .leftJoin(produtos, eq(produtos.id, canais.produto_id))
    .where(and(eq(canais.criador_id, criadorId), vivos(canais)))
    .orderBy(asc(canais.ordem), asc(sql`lower(${canais.nome})`));
  return linhas.map((c) => ({
    id: c.id,
    nome: c.nome,
    descricao: c.descricao,
    ordem: c.ordem,
    acesso: c.acesso,
    grupo: c.grupoId ? { id: c.grupoId, nome: c.grupoNome ?? "" } : null,
    produto: c.produtoId ? { id: c.produtoId, titulo: c.produtoTitulo ?? "" } : null,
    quemPosta: c.quemPosta,
    padrao: c.padrao,
    publicacoes: c.publicacoes,
    versao: c.updatedAt.toISOString(),
  }));
}

// ---------------------------------------------------------------- escritas (equipe)

export interface DadosCanal {
  nome: string;
  descricao: string;
  ordem: number;
  acesso: AcessoCanal;
  grupoId: string | null;
  produtoId: string | null;
  quemPosta: QuemPostaCanal;
}

interface Equipe {
  criadorId: string;
  usuarioId: string;
}

/** Grupo/produto do canal: do MESMO criador e vivos (a FK composta garante o criador de novo). */
async function conferirAlvo(tx: Transacao, criadorId: string, d: DadosCanal) {
  if (d.acesso === "GRUPO") {
    const [g] = await tx.select({ id: criadores_grupos.id }).from(criadores_grupos).where(and(eq(criadores_grupos.id, d.grupoId ?? ""), eq(criadores_grupos.criador_id, criadorId), vivos(criadores_grupos)));
    if (!g) throw new ErroDeNegocio("Grupo não encontrado.");
  }
  if (d.acesso === "PRODUTO") {
    const [p] = await tx.select({ id: produtos.id }).from(produtos).where(and(eq(produtos.id, d.produtoId ?? ""), eq(produtos.criador_id, criadorId), vivos(produtos)));
    if (!p) throw new ErroDeNegocio("Curso não encontrado.");
  }
}

const colunas = (d: DadosCanal) => ({
  nome: d.nome,
  descricao: d.descricao,
  ordem: d.ordem,
  acesso: d.acesso,
  grupo_id: d.acesso === "GRUPO" ? d.grupoId : null,
  produto_id: d.acesso === "PRODUTO" ? d.produtoId : null,
  quem_posta: d.quemPosta,
});

/** Nome repetido (índice único) vira mensagem. */
function nomeRepetido(e: unknown): never {
  if (violouUnico(e)) throw new ErroDeNegocio("Já existe um canal com este nome.");
  throw e;
}

export async function criarCanal(equipe: Equipe, d: DadosCanal): Promise<{ id: string; versao: string }> {
  return db
    .transaction(async (tx) => {
      await conferirAlvo(tx, equipe.criadorId, d);
      const [c] = await tx
        .insert(canais)
        .values({ criador_id: equipe.criadorId, ...colunas(d), modified_by: equipe.usuarioId })
        .returning({ id: canais.id, updated_at: canais.updated_at });
      await registrarAuditoria(tx, {
        userId: equipe.usuarioId,
        criadorId: equipe.criadorId,
        acao: "criar",
        tabela: "criadores_canais",
        registroId: c.id,
        detalhes: `Criou o canal "${d.nome}" (${d.acesso}, publica: ${d.quemPosta})`,
        dadosNovos: colunas(d),
      });
      return { id: c.id, versao: c.updated_at.toISOString() };
    })
    .catch(nomeRepetido);
}

export async function salvarCanal(equipe: Equipe, canalId: string, versao: Date, d: DadosCanal): Promise<{ versao: string }> {
  return db
    .transaction(async (tx) => {
      const daArea = and(travaDeColisao(canais, canalId, versao), eq(canais.criador_id, equipe.criadorId));
      const [antes] = await tx.select().from(canais).where(daArea);
      if (!antes) throw new ErroDeNegocio(MSG_COLISAO);
      if (antes.padrao && d.acesso !== "TODOS") throw new ErroDeNegocio("O canal Geral é sempre de todos os membros.");
      await conferirAlvo(tx, equipe.criadorId, d);
      const [c] = await tx
        .update(canais)
        .set({ ...colunas(d), updated_at: new Date(), modified_by: equipe.usuarioId })
        .where(daArea)
        .returning({ updated_at: canais.updated_at });
      if (!c) throw new ErroDeNegocio(MSG_COLISAO);
      await registrarAuditoria(tx, {
        userId: equipe.usuarioId,
        criadorId: equipe.criadorId,
        acao: "atualizar",
        tabela: "criadores_canais",
        registroId: canalId,
        detalhes: `Alterou o canal "${d.nome}"`,
        dadosAnteriores: { nome: antes.nome, descricao: antes.descricao, ordem: antes.ordem, acesso: antes.acesso, grupo_id: antes.grupo_id, produto_id: antes.produto_id, quem_posta: antes.quem_posta },
        dadosNovos: colunas(d),
      });
      return { versao: c.updated_at.toISOString() };
    })
    .catch(nomeRepetido);
}

/** Remove (soft delete) o canal; as publicações dele somem junto do feed. O Geral não sai. */
export async function removerCanal(equipe: Equipe, canalId: string, versao: Date): Promise<void> {
  await db.transaction(async (tx) => {
    const daArea = and(travaDeColisao(canais, canalId, versao), eq(canais.criador_id, equipe.criadorId));
    const [antes] = await tx.select({ nome: canais.nome, padrao: canais.padrao }).from(canais).where(daArea);
    if (!antes) throw new ErroDeNegocio(MSG_COLISAO);
    if (antes.padrao) throw new ErroDeNegocio("O canal Geral não pode ser removido.");
    await tx.update(canais).set(marcaDeExclusao(equipe.usuarioId)).where(daArea);
    await registrarAuditoria(tx, {
      userId: equipe.usuarioId,
      criadorId: equipe.criadorId,
      acao: "excluir",
      tabela: "criadores_canais",
      registroId: canalId,
      detalhes: `Removeu o canal "${antes.nome}"`,
    });
  });
}
