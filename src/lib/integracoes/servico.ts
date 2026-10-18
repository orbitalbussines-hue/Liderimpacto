import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import type { Transacao } from "@/lib/db";
import type { PlataformaIntegracao } from "@/lib/db/schema/_enums";
import { criadores_integracoes as integ, criadores_integracoes_eventos as ev, criadores_integracoes_produtos as mapa, produtos } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { violouUnico } from "@/lib/membros/vinculos";
import { cifrarSegredo } from "@/lib/webhooks/segredo";
import { finalDoSegredo, PRODUTO_EXTERNO, REPROCESSAVEIS, ROTULO_PLATAFORMA, SEGREDO_EXTERNO } from "./regras";

/**
 * ESCRITA das integrações Hotmart/Eduzz (RN-230, RN-231, RN-234), na transação de quem chama, criador do
 * HOST, trilha junto. O segredo (hottok / chave da Eduzz) vem da plataforma externa: entra cifrado
 * (AAD `integracao:<id>`) e nunca volta à tela nem à trilha — só os 4 últimos caracteres.
 */

const TABELA = "criadores_integracoes";
const TABELA_MAPA = "criadores_integracoes_produtos";
export const aadDaIntegracao = (id: string) => `integracao:${id}`;

function conferirSegredo(segredo: string) {
  if (!SEGREDO_EXTERNO.test(segredo)) throw new ErroDeNegocio("Token inválido: cole o valor exato, sem espaços (8 a 200 caracteres).");
}

export async function conectarIntegracao(tx: Transacao, p: { criadorId: string; autor: string; plataforma: PlataformaIntegracao; segredo: string }): Promise<{ id: string; versao: Date }> {
  conferirSegredo(p.segredo);
  const id = randomUUID();
  try {
    const [i] = await tx
      .insert(integ)
      .values({ id, criador_id: p.criadorId, plataforma: p.plataforma, segredo_cifrado: cifrarSegredo(p.segredo, aadDaIntegracao(id)), segredo_final: finalDoSegredo(p.segredo), modified_by: p.autor })
      .returning({ versao: integ.updated_at });
    await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "criar", tabela: TABELA, registroId: id, detalhes: `Conectou a ${ROTULO_PLATAFORMA[p.plataforma]}`, dadosNovos: { plataforma: p.plataforma, segredo_final: finalDoSegredo(p.segredo) } });
    return { id, versao: i.versao };
  } catch (e) {
    if (violouUnico(e)) throw new ErroDeNegocio(`A ${ROTULO_PLATAFORMA[p.plataforma]} já está conectada nesta área.`);
    throw e;
  }
}

async function travada(tx: Transacao, criadorId: string, integracaoId: string, versao: Date) {
  const [i] = await tx
    .select({ plataforma: integ.plataforma, segredoFinal: integ.segredo_final })
    .from(integ)
    .where(and(travaDeColisao(integ, integracaoId, versao), eq(integ.criador_id, criadorId)))
    .for("update");
  if (!i) throw new ErroDeNegocio(MSG_COLISAO);
  return i;
}

export async function trocarSegredoIntegracao(tx: Transacao, p: { criadorId: string; autor: string; integracaoId: string; versao: Date; segredo: string }): Promise<{ versao: Date }> {
  conferirSegredo(p.segredo);
  const antes = await travada(tx, p.criadorId, p.integracaoId, p.versao);
  const [i] = await tx
    .update(integ)
    .set({ segredo_cifrado: cifrarSegredo(p.segredo, aadDaIntegracao(p.integracaoId)), segredo_final: finalDoSegredo(p.segredo), updated_at: new Date(), modified_by: p.autor })
    .where(and(travaDeColisao(integ, p.integracaoId, p.versao), eq(integ.criador_id, p.criadorId)))
    .returning({ versao: integ.updated_at });
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "atualizar",
    tabela: TABELA,
    registroId: p.integracaoId,
    detalhes: `Trocou o token da ${ROTULO_PLATAFORMA[antes.plataforma]}`,
    dadosAnteriores: { segredo_final: antes.segredoFinal },
    dadosNovos: { segredo_final: finalDoSegredo(p.segredo) },
  });
  return { versao: i.versao };
}

/** Desconecta (soft delete) e tira os mapeamentos: a URL antiga passa a responder 404. */
export async function desconectarIntegracao(tx: Transacao, p: { criadorId: string; autor: string; integracaoId: string; versao: Date }): Promise<{ mapeamentos: number }> {
  const antes = await travada(tx, p.criadorId, p.integracaoId, p.versao);
  await tx.update(integ).set(marcaDeExclusao(p.autor)).where(and(eq(integ.id, p.integracaoId), eq(integ.criador_id, p.criadorId)));
  const tirados = await tx
    .update(mapa)
    .set(marcaDeExclusao(p.autor))
    .where(and(eq(mapa.integracao_id, p.integracaoId), eq(mapa.criador_id, p.criadorId), vivos(mapa)))
    .returning({ id: mapa.id });
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "excluir", tabela: TABELA, registroId: p.integracaoId, detalhes: `Desconectou a ${ROTULO_PLATAFORMA[antes.plataforma]} (${tirados.length} mapeamento(s) removido(s))` });
  return { mapeamentos: tirados.length };
}

/** Um produto externo → 1+ cursos (uma linha por curso). Curso já mapeado para o mesmo produto = pulado. */
export async function criarMapeamento(
  tx: Transacao,
  p: { criadorId: string; autor: string; integracaoId: string; produtoExterno: string; nomeExterno: string | null; produtoIds: readonly string[]; diasAcesso: number | null },
): Promise<{ criados: number }> {
  if (!PRODUTO_EXTERNO.test(p.produtoExterno)) throw new ErroDeNegocio("Id do produto inválido: use letras, números, hífen ou sublinhado.");
  const [i] = await tx.select({ plataforma: integ.plataforma }).from(integ).where(and(eq(integ.id, p.integracaoId), eq(integ.criador_id, p.criadorId), vivos(integ)));
  if (!i) throw new ErroDeNegocio("Integração não encontrada. Recarregue a página.");
  const ids = [...new Set(p.produtoIds)];
  const cursos = await tx.select({ id: produtos.id, titulo: produtos.titulo }).from(produtos).where(and(eq(produtos.criador_id, p.criadorId), inArray(produtos.id, ids), vivos(produtos)));
  if (cursos.length !== ids.length || ids.length === 0) throw new ErroDeNegocio("Curso inválido. Recarregue a página.");
  const criados = await tx
    .insert(mapa)
    .values(ids.map((produtoId) => ({ criador_id: p.criadorId, integracao_id: p.integracaoId, produto_externo: p.produtoExterno, nome_externo: p.nomeExterno, produto_id: produtoId, dias_acesso: p.diasAcesso, modified_by: p.autor })))
    .onConflictDoNothing()
    .returning({ id: mapa.id, produtoId: mapa.produto_id });
  if (criados.length === 0) throw new ErroDeNegocio("Esses cursos já estão mapeados para este produto.");
  for (const c of criados) {
    await registrarAuditoria(tx, {
      userId: p.autor,
      criadorId: p.criadorId,
      acao: "criar",
      tabela: TABELA_MAPA,
      registroId: c.id,
      detalhes: `Mapeou o produto ${p.produtoExterno} da ${ROTULO_PLATAFORMA[i.plataforma]} para "${cursos.find((x) => x.id === c.produtoId)?.titulo}"`,
      dadosNovos: { produto_externo: p.produtoExterno, produto_id: c.produtoId, dias_acesso: p.diasAcesso },
    });
  }
  return { criados: criados.length };
}

/** Tira o curso do mapeamento (vale para os próximos eventos; matrícula já feita fica). */
export async function excluirMapeamento(tx: Transacao, p: { criadorId: string; autor: string; mapeamentoId: string; versao: Date }): Promise<void> {
  const [m] = await tx
    .update(mapa)
    .set(marcaDeExclusao(p.autor))
    .where(and(travaDeColisao(mapa, p.mapeamentoId, p.versao), eq(mapa.criador_id, p.criadorId)))
    .returning({ produtoExterno: mapa.produto_externo, produtoId: mapa.produto_id });
  if (!m) throw new ErroDeNegocio(MSG_COLISAO);
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "excluir", tabela: TABELA_MAPA, registroId: p.mapeamentoId, detalhes: `Removeu o mapeamento do produto ${m.produtoExterno}`, dadosAnteriores: m });
}

/** SEM_MAPEAMENTO/ERRO → PENDENTE (quem chama enfileira depois do commit). */
export async function reprocessarEvento(tx: Transacao, p: { criadorId: string; autor: string; eventoId: string; versao: Date }): Promise<{ versao: Date }> {
  const [antes] = await tx
    .select({ situacao: ev.situacao })
    .from(ev)
    .where(and(travaDeColisao(ev, p.eventoId, p.versao), eq(ev.criador_id, p.criadorId)))
    .for("update");
  if (!antes) throw new ErroDeNegocio(MSG_COLISAO);
  if (!REPROCESSAVEIS.includes(antes.situacao)) throw new ErroDeNegocio("Só eventos sem mapeamento ou com erro podem ser reprocessados.");
  const [r] = await tx
    .update(ev)
    .set({ situacao: "PENDENTE", erro: null, updated_at: new Date(), modified_by: p.autor })
    .where(eq(ev.id, p.eventoId))
    .returning({ versao: ev.updated_at });
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "atualizar", tabela: "criadores_integracoes_eventos", registroId: p.eventoId, detalhes: "Pediu o reprocessamento do evento", dadosAnteriores: { situacao: antes.situacao }, dadosNovos: { situacao: "PENDENTE" } });
  return { versao: r.versao };
}
