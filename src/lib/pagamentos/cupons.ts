import "server-only";
import { and, eq } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import type { Transacao } from "@/lib/db";
import type { SituacaoCupom, TipoCupom } from "@/lib/db/schema/_enums";
import { criadores_cupons as cupons, criadores_ofertas as ofertas } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { violouUnico } from "@/lib/membros/vinculos";

/** ESCRITA dos cupons (RN-213). O código não muda depois de criado (pode ter sido divulgado). */

const TABELA = "criadores_cupons";
export const MSG_CUPOM_DUPLICADO = "Já existe um cupom com este código.";

export interface CamposCupom {
  tipo: TipoCupom;
  percentualBps: number | null;
  valorCentavos: number | null;
  ofertaId: string | null;
  validoAte: Date | null;
  limiteUsos: number | null;
}

const iso = (d: Date | null) => d?.toISOString() ?? null;

async function conferir(tx: Transacao, criadorId: string, c: CamposCupom, agora: Date, validadeMudou: boolean) {
  if ((c.tipo === "PERCENTUAL") !== (c.percentualBps !== null) || (c.tipo === "VALOR") !== (c.valorCentavos !== null)) throw new ErroDeNegocio("Informe o desconto conforme o tipo do cupom.");
  if (validadeMudou && c.validoAte && c.validoAte.getTime() <= agora.getTime()) throw new ErroDeNegocio("A validade precisa ser uma data futura.");
  if (c.ofertaId) {
    const [o] = await tx.select({ id: ofertas.id }).from(ofertas).where(and(eq(ofertas.id, c.ofertaId), eq(ofertas.criador_id, criadorId), vivos(ofertas)));
    if (!o) throw new ErroDeNegocio("Oferta não encontrada.");
  }
}

const linha = (c: CamposCupom) => ({ tipo: c.tipo, percentual_bps: c.percentualBps, valor_centavos: c.valorCentavos, oferta_id: c.ofertaId, valido_ate: c.validoAte, limite_usos: c.limiteUsos });
const trilha = (c: CamposCupom) => ({ ...linha(c), valido_ate: iso(c.validoAte) });

export async function criarCupom(tx: Transacao, p: CamposCupom & { criadorId: string; autor: string; codigo: string; agora?: Date }): Promise<{ id: string; versao: Date }> {
  await conferir(tx, p.criadorId, p, p.agora ?? new Date(), true);
  const [c] = await tx
    .insert(cupons)
    .values({ criador_id: p.criadorId, codigo: p.codigo, ...linha(p), modified_by: p.autor })
    .returning({ id: cupons.id, versao: cupons.updated_at })
    .catch((e: unknown) => {
      if (violouUnico(e)) throw new ErroDeNegocio(MSG_CUPOM_DUPLICADO);
      throw e;
    });
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "criar", tabela: TABELA, registroId: c.id, detalhes: `Criou o cupom ${p.codigo}`, dadosNovos: { codigo: p.codigo, ...trilha(p) } });
  return c;
}

async function travado(tx: Transacao, criadorId: string, cupomId: string, versao: Date) {
  const [c] = await tx.select().from(cupons).where(and(travaDeColisao(cupons, cupomId, versao), eq(cupons.criador_id, criadorId))).for("update");
  if (!c) throw new ErroDeNegocio(MSG_COLISAO);
  return c;
}

async function gravar(tx: Transacao, criadorId: string, cupomId: string, versao: Date, valores: Partial<typeof cupons.$inferInsert>) {
  const [c] = await tx.update(cupons).set(valores).where(and(travaDeColisao(cupons, cupomId, versao), eq(cupons.criador_id, criadorId))).returning({ versao: cupons.updated_at });
  if (!c) throw new ErroDeNegocio(MSG_COLISAO);
  return c;
}

export async function salvarCupom(tx: Transacao, p: CamposCupom & { criadorId: string; autor: string; cupomId: string; versao: Date; agora?: Date }): Promise<{ versao: Date }> {
  const antes = await travado(tx, p.criadorId, p.cupomId, p.versao);
  await conferir(tx, p.criadorId, p, p.agora ?? new Date(), iso(p.validoAte) !== iso(antes.valido_ate));
  const v = await gravar(tx, p.criadorId, p.cupomId, p.versao, { ...linha(p), updated_at: new Date(), modified_by: p.autor });
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "atualizar",
    tabela: TABELA,
    registroId: p.cupomId,
    detalhes: `Editou o cupom ${antes.codigo}`,
    dadosAnteriores: { tipo: antes.tipo, percentual_bps: antes.percentual_bps, valor_centavos: antes.valor_centavos, oferta_id: antes.oferta_id, valido_ate: iso(antes.valido_ate), limite_usos: antes.limite_usos },
    dadosNovos: trilha(p),
  });
  return v;
}

export async function mudarSituacaoCupom(tx: Transacao, p: { criadorId: string; autor: string; cupomId: string; versao: Date; situacao: SituacaoCupom }): Promise<{ versao: Date }> {
  const antes = await travado(tx, p.criadorId, p.cupomId, p.versao);
  if (antes.situacao === p.situacao) throw new ErroDeNegocio("O cupom já está nesta situação.");
  const v = await gravar(tx, p.criadorId, p.cupomId, p.versao, { situacao: p.situacao, updated_at: new Date(), modified_by: p.autor });
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "atualizar", tabela: TABELA, registroId: p.cupomId, detalhes: `Cupom ${antes.codigo}: ${antes.situacao} → ${p.situacao}`, dadosAnteriores: { situacao: antes.situacao }, dadosNovos: { situacao: p.situacao } });
  return v;
}

/** Soft delete; as vendas que usaram o cupom continuam ligadas a ele. O código fica livre de novo. */
export async function excluirCupom(tx: Transacao, p: { criadorId: string; autor: string; cupomId: string; versao: Date }): Promise<void> {
  const antes = await travado(tx, p.criadorId, p.cupomId, p.versao);
  await gravar(tx, p.criadorId, p.cupomId, p.versao, marcaDeExclusao(p.autor));
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "excluir", tabela: TABELA, registroId: p.cupomId, detalhes: `Excluiu o cupom ${antes.codigo}`, dadosAnteriores: { codigo: antes.codigo, situacao: antes.situacao } });
}
