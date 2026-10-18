import { z } from "zod";
import { SITUACOES_VOUCHER } from "@/lib/db/schema/_enums";
import { RE_CODIGO_VOUCHER, normalizarCodigoVoucher } from "@/lib/vouchers/regras";
import { idSchema, versaoSchema } from "./membros";

/** Vouchers (RN-201). Mesmos schemas na action e na tela. */

export const codigoVoucher = z
  .string()
  .max(40, "Código inválido.")
  .transform(normalizarCodigoVoucher)
  .pipe(z.string().regex(RE_CODIGO_VOUCHER, "Código inválido: 6 a 16 letras e números, sem 0, O, 1 e I."));

const camposVoucher = {
  descricao: z.string().trim().max(200, "Descrição muito longa (máximo de 200).").regex(/^[^<>]*$/, "Descrição com caracteres inválidos.").default(""),
  /** ISO com fuso; nulo = sem prazo. */
  validoAte: z.iso.datetime({ offset: true, message: "Data inválida." }).transform((v) => new Date(v)).nullable().default(null),
  limiteUsos: z.number().int().min(1, "Limite mínimo de 1 uso.").max(100000).nullable().default(null),
  limitePorPessoa: z.number().int().min(1).max(100, "No máximo 100 usos por pessoa.").default(1),
  diasAcesso: z.number().int().min(1, "Mínimo de 1 dia.").max(3650, "Máximo de 3650 dias.").nullable().default(null),
  produtoIds: z.array(idSchema).min(1, "Escolha ao menos um curso.").max(50, "Cursos demais."),
};

/** `codigo` ausente/nulo = o sistema gera um (8 símbolos). */
export const criarVoucherSchema = z.strictObject({ codigo: codigoVoucher.nullable().default(null), ...camposVoucher });
/** O código não muda depois de criado (já pode ter sido divulgado). */
export const salvarVoucherSchema = z.strictObject({ voucherId: idSchema, versao: versaoSchema, ...camposVoucher });
export const situacaoVoucherSchema = z.strictObject({ voucherId: idSchema, versao: versaoSchema, situacao: z.enum(SITUACOES_VOUCHER) });
export const excluirVoucherSchema = z.strictObject({ voucherId: idSchema, versao: versaoSchema });
export const resgatarVoucherSchema = z.strictObject({ codigo: codigoVoucher });
