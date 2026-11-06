"use server";

import { headers } from "next/headers";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { ipDoCliente } from "@/lib/auth/ip";
import { alvoAtual } from "@/lib/criador/atual";
import { resgatarPedidoMarketplace } from "@/lib/integracoes/bling/resgate";
import { resgatarCodigoPublico } from "@/lib/resgates/publico";
import { resgateCodigoSchema, resgatePedidoSchema } from "@/lib/validators/resgate-publico";

/**
 * Resgate PÚBLICO de quem comprou fora e ainda não tem conta (RN-262, RN-266), em `/resgatar-pedido`.
 * Sem login de propósito: o criador vem do HOST (nunca do corpo), o IP do `ipDoCliente` e as defesas
 * (teto persistido, recusa única, trilha) moram nos serviços. O `/resgatar` logado continua igual.
 */

async function area() {
  const alvo = await alvoAtual();
  if (alvo?.tipo !== "criador") throw new ErroDeNegocio("Este endereço não aceita resgates.");
  return { criadorId: alvo.criador.id, ip: ipDoCliente(await headers()) };
}

/** Porta (a): número do pedido do Mercado Livre/TikTok Shop + CPF + nome + e-mail (pedido no Bling). */
export async function acaoResgatarPedido(entrada: unknown) {
  return executar(async () => {
    const a = await area();
    const e = resgatePedidoSchema.parse(entrada);
    return resgatarPedidoMarketplace({ ...a, numeroPedido: e.numeroPedido, cpf: e.cpf, nome: e.nome, email: e.email });
  });
}

/** Porta (b): código de voucher (ex.: enviado pelo chat da Amazon) + nome + e-mail. */
export async function acaoResgatarCodigo(entrada: unknown) {
  return executar(async () => {
    const a = await area();
    const e = resgateCodigoSchema.parse(entrada);
    return resgatarCodigoPublico({ ...a, codigo: e.codigo, nome: e.nome, email: e.email });
  });
}
