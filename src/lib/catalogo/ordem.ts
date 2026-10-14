import "server-only";
import { sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import type { Transacao } from "@/lib/db";
import { MSG_COLISAO } from "@/lib/db/soft-delete";

/**
 * Ordem de irmaos (modulos de um produto, aulas de um modulo, questoes de uma avaliacao, itens de
 * uma trilha). O banco tem UNICO (pai, ordem)
 * entre os vivos, sem DEFERRABLE (indice parcial): reordenar em DUAS fases na mesma transacao —
 * afasta todos (+1.000.000) e grava 1..n. Sempre 1..n, sem buraco nem repeticao.
 * PRE-REQUISITO: quem chama ja travou a linha do PAI (`for update`); criar, remover e reordenar
 * no mesmo pai ficam em fila e o max(ordem) nunca e lido no meio de uma reordenacao.
 * Nomes de tabela/coluna sao constantes daqui (nunca entrada do usuario).
 */

export type Irmaos =
  | { tabela: "produtos_modulos"; pai: "produto_id" }
  | { tabela: "produtos_modulos_aulas"; pai: "modulo_id" }
  | { tabela: "produtos_avaliacoes_questoes"; pai: "avaliacao_id" }
  | { tabela: "criadores_trilhas_itens"; pai: "trilha_id" };
export const MODULOS: Irmaos = { tabela: "produtos_modulos", pai: "produto_id" };
export const AULAS: Irmaos = { tabela: "produtos_modulos_aulas", pai: "modulo_id" };
/** Passo 7: questões de uma avaliação e itens de uma trilha seguem a mesma ordem 1..n. */
export const QUESTOES: Irmaos = { tabela: "produtos_avaliacoes_questoes", pai: "avaliacao_id" };
export const ITENS_TRILHA: Irmaos = { tabela: "criadores_trilhas_itens", pai: "trilha_id" };

const AFASTAMENTO = 1_000_000;

const deste = (i: Irmaos, paiId: string, criadorId: string) =>
  sql`${sql.identifier(i.pai)} = ${paiId} and criador_id = ${criadorId} and is_deleted = false`;

interface Irmao {
  id: string;
  updated_at: Date;
}

/** Irmaos vivos na ordem atual, travados ate o fim da transacao. */
async function irmaos(tx: Transacao, i: Irmaos, paiId: string, criadorId: string): Promise<Irmao[]> {
  const r = await tx.execute<{ id: string; updated_at: Date }>(
    sql`select id, updated_at from ${sql.identifier(i.tabela)} where ${deste(i, paiId, criadorId)} order by ordem for update`,
  );
  return r.rows.map((x) => ({ id: x.id, updated_at: new Date(x.updated_at) }));
}

/** Proxima posicao (fim da lista). */
export async function proximaOrdem(tx: Transacao, i: Irmaos, paiId: string, criadorId: string): Promise<number> {
  const r = await tx.execute<{ proxima: number }>(
    sql`select coalesce(max(ordem), 0)::int + 1 as proxima from ${sql.identifier(i.tabela)} where ${deste(i, paiId, criadorId)}`,
  );
  return Number(r.rows[0]?.proxima ?? 1);
}

/** Duas fases: afasta e grava 1..n na ordem de `ids`. `autor` = reordenacao do usuario (versao muda). */
async function gravar(tx: Transacao, i: Irmaos, paiId: string, criadorId: string, ids: readonly string[], autor: { id: string; agora: Date } | null) {
  if (ids.length === 0) return;
  const t = sql.identifier(i.tabela);
  await tx.execute(sql`update ${t} set ordem = ordem + ${AFASTAMENTO} where ${deste(i, paiId, criadorId)}`);
  const valores = sql.join(
    ids.map((id, n) => sql`(${id}::uuid, ${n + 1}::int)`),
    sql`, `,
  );
  const versao = autor ? sql`, updated_at = ${autor.agora}, modified_by = ${autor.id}::uuid` : sql``;
  await tx.execute(sql`update ${t} as x set ordem = v.ordem${versao} from (values ${valores}) as v(id, ordem) where x.id = v.id and x.${sql.identifier(i.pai)} = ${paiId} and x.criador_id = ${criadorId} and x.is_deleted = false`);
}

/**
 * Reordenacao pedida pela tela, com TRAVA: a lista tem de ser exatamente os irmaos vivos, cada
 * um na versao que a tela viu. Alguem criou, removeu, renomeou ou reordenou antes = colisao.
 * Devolve a ordem antes e depois (ids) para a trilha e a versao nova (a mesma em todos os irmaos).
 */
export async function reordenar(
  tx: Transacao,
  i: Irmaos,
  p: { paiId: string; criadorId: string; autorId: string; itens: readonly { id: string; versao: Date }[] },
): Promise<{ antes: string[]; depois: string[]; versao: Date }> {
  const atuais = await irmaos(tx, i, p.paiId, p.criadorId);
  const porId = new Map(atuais.map((a) => [a.id, a.updated_at.getTime()]));
  const confere = atuais.length === p.itens.length && p.itens.every((it) => porId.get(it.id) === it.versao.getTime());
  if (!confere) throw new ErroDeNegocio(MSG_COLISAO);
  const depois = p.itens.map((it) => it.id);
  const agora = new Date();
  await gravar(tx, i, p.paiId, p.criadorId, depois, { id: p.autorId, agora });
  return { antes: atuais.map((a) => a.id), depois, versao: agora };
}

/** Depois de remover um irmao: fecha o buraco (1..n). Ajuste do sistema: a versao nao muda. */
export async function compactar(tx: Transacao, i: Irmaos, paiId: string, criadorId: string): Promise<void> {
  const atuais = await irmaos(tx, i, paiId, criadorId);
  await gravar(tx, i, paiId, criadorId, atuais.map((a) => a.id), null);
}
