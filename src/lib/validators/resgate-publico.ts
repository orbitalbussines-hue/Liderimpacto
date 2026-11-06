import { z } from "zod";
import { cpfValido, normalizarNumeroLoja, RE_NUMERO_LOJA, soDigitos } from "@/lib/integracoes/bling/regras";
import { emailPessoa, nomePessoa } from "./membros";
import { codigoVoucher } from "./vouchers";

/** Resgate público sem login (RN-262, RN-266). Mesmos schemas na action e na tela. */

const pessoa = { nome: nomePessoa, email: emailPessoa };

export const numeroPedidoSchema = z
  .string()
  .max(80, "Número do pedido inválido.")
  .transform(normalizarNumeroLoja)
  .pipe(z.string().regex(RE_NUMERO_LOJA, "Número do pedido inválido: copie como aparece no Mercado Livre ou no TikTok Shop."));

/** CPF com ou sem pontuação; sai só com os 11 dígitos, já com o dígito verificador conferido. */
export const cpfSchema = z
  .string()
  .max(20, "CPF inválido.")
  .regex(/^[\d.\s-]+$/, "CPF inválido: use só números.")
  .refine(cpfValido, "CPF inválido: confira os números.")
  .transform(soDigitos);

export const resgatePedidoSchema = z.strictObject({ numeroPedido: numeroPedidoSchema, cpf: cpfSchema, ...pessoa });
export const resgateCodigoSchema = z.strictObject({ codigo: codigoVoucher, ...pessoa });
