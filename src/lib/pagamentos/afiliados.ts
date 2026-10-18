import "server-only";
import { and, eq } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import type { Transacao } from "@/lib/db";
import type { SituacaoAfiliado } from "@/lib/db/schema/_enums";
import { criadores_afiliados as afiliados } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { violouUnico } from "@/lib/membros/vinculos";
import { gerarCodigoVoucher } from "@/lib/vouchers/regras";

/**
 * ESCRITA dos afiliados (RN-214): só RASTREIO (código no link → venda atribuída) e comissão CALCULADA;
 * o pagamento ao afiliado é feito pelo criador, fora da plataforma. O código não muda (já foi divulgado);
 * a comissão nova vale para as vendas novas (a venda congela a dela).
 */

const TABELA = "criadores_afiliados";
export const MSG_AFILIADO_DUPLICADO = "Já existe um afiliado com este código.";

export interface CamposAfiliado {
  nome: string;
  email: string;
  comissaoBps: number;
}

const linha = (c: CamposAfiliado) => ({ nome: c.nome, email: c.email, comissao_bps: c.comissaoBps });

export async function criarAfiliado(tx: Transacao, p: CamposAfiliado & { criadorId: string; autor: string; codigo: string | null }): Promise<{ id: string; codigo: string; versao: Date }> {
  let codigo = p.codigo;
  // Código gerado: mesmo alfabeto dos vouchers (sem 0/O/1/I), 8 símbolos; confere antes do UNIQUE.
  for (let i = 0; codigo === null && i < 5; i++) {
    const candidato = gerarCodigoVoucher();
    const [existe] = await tx.select({ id: afiliados.id }).from(afiliados).where(and(eq(afiliados.criador_id, p.criadorId), eq(afiliados.codigo, candidato), vivos(afiliados)));
    if (!existe) codigo = candidato;
  }
  if (codigo === null) throw new ErroDeNegocio("Não foi possível gerar um código. Tente de novo.");
  const [a] = await tx
    .insert(afiliados)
    .values({ criador_id: p.criadorId, codigo, ...linha(p), modified_by: p.autor })
    .returning({ id: afiliados.id, versao: afiliados.updated_at })
    .catch((e: unknown) => {
      if (violouUnico(e)) throw new ErroDeNegocio(MSG_AFILIADO_DUPLICADO);
      throw e;
    });
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "criar", tabela: TABELA, registroId: a.id, detalhes: `Cadastrou o afiliado ${codigo}`, dadosNovos: { codigo, ...linha(p) } });
  return { id: a.id, codigo, versao: a.versao };
}

async function travado(tx: Transacao, criadorId: string, afiliadoId: string, versao: Date) {
  const [a] = await tx.select().from(afiliados).where(and(travaDeColisao(afiliados, afiliadoId, versao), eq(afiliados.criador_id, criadorId))).for("update");
  if (!a) throw new ErroDeNegocio(MSG_COLISAO);
  return a;
}

async function gravar(tx: Transacao, criadorId: string, afiliadoId: string, versao: Date, valores: Partial<typeof afiliados.$inferInsert>) {
  const [a] = await tx.update(afiliados).set(valores).where(and(travaDeColisao(afiliados, afiliadoId, versao), eq(afiliados.criador_id, criadorId))).returning({ versao: afiliados.updated_at });
  if (!a) throw new ErroDeNegocio(MSG_COLISAO);
  return a;
}

export async function salvarAfiliado(tx: Transacao, p: CamposAfiliado & { criadorId: string; autor: string; afiliadoId: string; versao: Date }): Promise<{ versao: Date }> {
  const antes = await travado(tx, p.criadorId, p.afiliadoId, p.versao);
  const v = await gravar(tx, p.criadorId, p.afiliadoId, p.versao, { ...linha(p), updated_at: new Date(), modified_by: p.autor });
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "atualizar",
    tabela: TABELA,
    registroId: p.afiliadoId,
    detalhes: `Editou o afiliado ${antes.codigo}`,
    dadosAnteriores: { nome: antes.nome, email: antes.email, comissao_bps: antes.comissao_bps },
    dadosNovos: linha(p),
  });
  return v;
}

export async function mudarSituacaoAfiliado(tx: Transacao, p: { criadorId: string; autor: string; afiliadoId: string; versao: Date; situacao: SituacaoAfiliado }): Promise<{ versao: Date }> {
  const antes = await travado(tx, p.criadorId, p.afiliadoId, p.versao);
  if (antes.situacao === p.situacao) throw new ErroDeNegocio("O afiliado já está nesta situação.");
  const v = await gravar(tx, p.criadorId, p.afiliadoId, p.versao, { situacao: p.situacao, updated_at: new Date(), modified_by: p.autor });
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "atualizar", tabela: TABELA, registroId: p.afiliadoId, detalhes: `Afiliado ${antes.codigo}: ${antes.situacao} → ${p.situacao}`, dadosAnteriores: { situacao: antes.situacao }, dadosNovos: { situacao: p.situacao } });
  return v;
}

/** Soft delete; as vendas atribuídas continuam ligadas a ele (comissão já calculada). */
export async function excluirAfiliado(tx: Transacao, p: { criadorId: string; autor: string; afiliadoId: string; versao: Date }): Promise<void> {
  const antes = await travado(tx, p.criadorId, p.afiliadoId, p.versao);
  await gravar(tx, p.criadorId, p.afiliadoId, p.versao, marcaDeExclusao(p.autor));
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "excluir", tabela: TABELA, registroId: p.afiliadoId, detalhes: `Excluiu o afiliado ${antes.codigo}`, dadosAnteriores: { codigo: antes.codigo, nome: antes.nome } });
}
