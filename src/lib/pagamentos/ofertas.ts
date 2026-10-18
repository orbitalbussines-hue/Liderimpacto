import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import type { Transacao } from "@/lib/db";
import type { IntervaloAssinatura, SituacaoOferta, TipoOferta } from "@/lib/db/schema/_enums";
import { criadores_ofertas as ofertas, criadores_ofertas_produtos as ofertasProdutos, produtos } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";

/**
 * ESCRITA das ofertas (RN-212), na transação de quem chama, criador do HOST, trilha junto. O TIPO
 * não muda depois de criada (assinaturas existentes apontam para ela); preço e produtos mudam só para
 * as vendas NOVAS (a venda guarda os valores do momento).
 */

const TABELA = "criadores_ofertas";

export interface CamposOferta {
  nome: string;
  precoCentavos: number;
  intervalo: IntervaloAssinatura | null;
  diasAcesso: number | null;
  produtoIds: readonly string[];
}

function conferir(tipo: TipoOferta, c: CamposOferta) {
  if (tipo === "ASSINATURA" && (c.intervalo === null || c.diasAcesso !== null)) throw new ErroDeNegocio("Assinatura precisa do intervalo (mensal ou anual) e não tem dias de acesso.");
  if (tipo === "AVULSO" && c.intervalo !== null) throw new ErroDeNegocio("Oferta avulsa não tem intervalo.");
}

async function conferirProdutos(tx: Transacao, criadorId: string, ids: readonly string[]) {
  const unicos = [...new Set(ids)].sort();
  const achados = await tx.select({ id: produtos.id }).from(produtos).where(and(inArray(produtos.id, unicos), eq(produtos.criador_id, criadorId), vivos(produtos)));
  if (achados.length !== unicos.length) throw new ErroDeNegocio("Curso não encontrado.");
  return unicos;
}

const linha = (c: CamposOferta) => ({ nome: c.nome, preco_centavos: c.precoCentavos, intervalo: c.intervalo, dias_acesso: c.diasAcesso });

export async function criarOferta(tx: Transacao, p: CamposOferta & { criadorId: string; autor: string; tipo: TipoOferta }): Promise<{ id: string; versao: Date }> {
  conferir(p.tipo, p);
  const ids = await conferirProdutos(tx, p.criadorId, p.produtoIds);
  const [o] = await tx
    .insert(ofertas)
    .values({ criador_id: p.criadorId, tipo: p.tipo, ...linha(p), modified_by: p.autor })
    .returning({ id: ofertas.id, versao: ofertas.updated_at });
  await tx.insert(ofertasProdutos).values(ids.map((produtoId) => ({ criador_id: p.criadorId, oferta_id: o.id, produto_id: produtoId, modified_by: p.autor })));
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "criar", tabela: TABELA, registroId: o.id, detalhes: `Criou a oferta "${p.nome}"`, dadosNovos: { tipo: p.tipo, ...linha(p), produto_ids: ids } });
  return o;
}

async function ofertaTravada(tx: Transacao, criadorId: string, ofertaId: string, versao: Date) {
  const [o] = await tx.select().from(ofertas).where(and(travaDeColisao(ofertas, ofertaId, versao), eq(ofertas.criador_id, criadorId))).for("update");
  if (!o) throw new ErroDeNegocio(MSG_COLISAO);
  return o;
}

async function gravar(tx: Transacao, criadorId: string, ofertaId: string, versao: Date, valores: Partial<typeof ofertas.$inferInsert>) {
  const [o] = await tx
    .update(ofertas)
    .set(valores)
    .where(and(travaDeColisao(ofertas, ofertaId, versao), eq(ofertas.criador_id, criadorId)))
    .returning({ versao: ofertas.updated_at });
  if (!o) throw new ErroDeNegocio(MSG_COLISAO);
  return o;
}

export async function salvarOferta(tx: Transacao, p: CamposOferta & { criadorId: string; autor: string; ofertaId: string; versao: Date }): Promise<{ versao: Date }> {
  const antes = await ofertaTravada(tx, p.criadorId, p.ofertaId, p.versao);
  conferir(antes.tipo, p);
  const novos = await conferirProdutos(tx, p.criadorId, p.produtoIds);
  const atuais = (
    await tx.select({ id: ofertasProdutos.produto_id }).from(ofertasProdutos).where(and(eq(ofertasProdutos.oferta_id, p.ofertaId), vivos(ofertasProdutos)))
  ).map((l) => l.id).sort();
  const sair = atuais.filter((id) => !novos.includes(id));
  const entrar = novos.filter((id) => !atuais.includes(id));
  if (sair.length) {
    await tx.update(ofertasProdutos).set(marcaDeExclusao(p.autor)).where(and(eq(ofertasProdutos.oferta_id, p.ofertaId), inArray(ofertasProdutos.produto_id, sair), vivos(ofertasProdutos)));
  }
  if (entrar.length) await tx.insert(ofertasProdutos).values(entrar.map((produtoId) => ({ criador_id: p.criadorId, oferta_id: p.ofertaId, produto_id: produtoId, modified_by: p.autor })));
  const v = await gravar(tx, p.criadorId, p.ofertaId, p.versao, { ...linha(p), updated_at: new Date(), modified_by: p.autor });
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "atualizar",
    tabela: TABELA,
    registroId: p.ofertaId,
    detalhes: `Editou a oferta "${antes.nome}"`,
    dadosAnteriores: { nome: antes.nome, preco_centavos: antes.preco_centavos, intervalo: antes.intervalo, dias_acesso: antes.dias_acesso, produto_ids: atuais },
    dadosNovos: { ...linha(p), produto_ids: novos },
  });
  return v;
}

export async function mudarSituacaoOferta(tx: Transacao, p: { criadorId: string; autor: string; ofertaId: string; versao: Date; situacao: SituacaoOferta }): Promise<{ versao: Date }> {
  const antes = await ofertaTravada(tx, p.criadorId, p.ofertaId, p.versao);
  if (antes.situacao === p.situacao) throw new ErroDeNegocio("A oferta já está nesta situação.");
  const v = await gravar(tx, p.criadorId, p.ofertaId, p.versao, { situacao: p.situacao, updated_at: new Date(), modified_by: p.autor });
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "atualizar", tabela: TABELA, registroId: p.ofertaId, detalhes: `Oferta "${antes.nome}": ${antes.situacao} → ${p.situacao}`, dadosAnteriores: { situacao: antes.situacao }, dadosNovos: { situacao: p.situacao } });
  return v;
}

/** Soft delete: vendas e assinaturas continuam apontando para ela (histórico); não vende mais. */
export async function excluirOferta(tx: Transacao, p: { criadorId: string; autor: string; ofertaId: string; versao: Date }): Promise<void> {
  const antes = await ofertaTravada(tx, p.criadorId, p.ofertaId, p.versao);
  await tx.update(ofertasProdutos).set(marcaDeExclusao(p.autor)).where(and(eq(ofertasProdutos.oferta_id, p.ofertaId), vivos(ofertasProdutos)));
  await gravar(tx, p.criadorId, p.ofertaId, p.versao, marcaDeExclusao(p.autor));
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "excluir", tabela: TABELA, registroId: p.ofertaId, detalhes: `Excluiu a oferta "${antes.nome}"`, dadosAnteriores: { nome: antes.nome, situacao: antes.situacao } });
}
