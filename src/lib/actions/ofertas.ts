"use server";

import { executar } from "@/lib/acao";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { db } from "@/lib/db";
import { criarAfiliado, excluirAfiliado, mudarSituacaoAfiliado, salvarAfiliado } from "@/lib/pagamentos/afiliados";
import { criarCupom, excluirCupom, mudarSituacaoCupom, salvarCupom } from "@/lib/pagamentos/cupons";
import { criarOferta, excluirOferta, mudarSituacaoOferta, salvarOferta } from "@/lib/pagamentos/ofertas";
import {
  criarAfiliadoSchema,
  criarCupomSchema,
  criarOfertaSchema,
  excluirAfiliadoSchema,
  excluirCupomSchema,
  excluirOfertaSchema,
  salvarAfiliadoSchema,
  salvarCupomSchema,
  salvarOfertaSchema,
  situacaoAfiliadoSchema,
  situacaoCupomSchema,
  situacaoOfertaSchema,
} from "@/lib/validators/pagamentos";

/**
 * Ofertas, cupons e afiliados (RN-212 a RN-214), criador do HOST, DONO e ADMIN. Não dependem da chave
 * do Stripe (a equipe monta o catálogo antes de conectar). Excluir = soft delete (ModalConfirmacaoBlock).
 */

const iso = (v: { versao: Date }) => ({ versao: v.versao.toISOString() });

async function equipe() {
  const { usuario, criador } = await exigirMembro(EQUIPE);
  return { criadorId: criador.id, autor: usuario.id };
}

export async function acaoCriarOferta(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = criarOfertaSchema.parse(entrada);
    const o = await db.transaction((tx) => criarOferta(tx, { ...e, ...quem }));
    return { id: o.id, ...iso(o) };
  });
}

export async function acaoSalvarOferta(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = salvarOfertaSchema.parse(entrada);
    return iso(await db.transaction((tx) => salvarOferta(tx, { ...e, ...quem })));
  });
}

export async function acaoMudarSituacaoOferta(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = situacaoOfertaSchema.parse(entrada);
    return iso(await db.transaction((tx) => mudarSituacaoOferta(tx, { ...e, ...quem })));
  });
}

export async function acaoExcluirOferta(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = excluirOfertaSchema.parse(entrada);
    await db.transaction((tx) => excluirOferta(tx, { ...e, ...quem }));
    return null;
  });
}

export async function acaoCriarCupom(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = criarCupomSchema.parse(entrada);
    const c = await db.transaction((tx) => criarCupom(tx, { ...e, ...quem }));
    return { id: c.id, ...iso(c) };
  });
}

export async function acaoSalvarCupom(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = salvarCupomSchema.parse(entrada);
    return iso(await db.transaction((tx) => salvarCupom(tx, { ...e, ...quem })));
  });
}

export async function acaoMudarSituacaoCupom(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = situacaoCupomSchema.parse(entrada);
    return iso(await db.transaction((tx) => mudarSituacaoCupom(tx, { ...e, ...quem })));
  });
}

export async function acaoExcluirCupom(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = excluirCupomSchema.parse(entrada);
    await db.transaction((tx) => excluirCupom(tx, { ...e, ...quem }));
    return null;
  });
}

export async function acaoCriarAfiliado(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = criarAfiliadoSchema.parse(entrada);
    const a = await db.transaction((tx) => criarAfiliado(tx, { ...e, ...quem }));
    return { id: a.id, codigo: a.codigo, ...iso(a) };
  });
}

export async function acaoSalvarAfiliado(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = salvarAfiliadoSchema.parse(entrada);
    return iso(await db.transaction((tx) => salvarAfiliado(tx, { ...e, ...quem })));
  });
}

export async function acaoMudarSituacaoAfiliado(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = situacaoAfiliadoSchema.parse(entrada);
    return iso(await db.transaction((tx) => mudarSituacaoAfiliado(tx, { ...e, ...quem })));
  });
}

export async function acaoExcluirAfiliado(entrada: unknown) {
  return executar(async () => {
    const quem = await equipe();
    const e = excluirAfiliadoSchema.parse(entrada);
    await db.transaction((tx) => excluirAfiliado(tx, { ...e, ...quem }));
    return null;
  });
}
