import { z } from "zod";
import { fimDoDiaEmBrasilia } from "@/lib/matriculas/regras";
import { emailPessoa, idSchema, nomeGrupo, nomePessoa, versaoSchema } from "./membros";

/** Validadores de matricula (RN-116). Tela e action usam os mesmos. */

/** Produto no CSV: o codigo ("164") ou o endereco/slug ("lider-de-impacto"). */
export const RE_REF_PRODUTO = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Expiracao opcional: "AAAA-MM-DD" (input date) ou "DD/MM/AAAA" -> ultimo instante do dia em
 * Brasilia; vazio/nulo = sem expiracao. (Data no passado: conferida com o relogio do servidor.)
 */
export const expiracaoOpcional = z
  .string()
  .trim()
  .max(10, "Data de expiração inválida (use DD/MM/AAAA).")
  .nullable()
  .default(null)
  .transform((v, ctx) => {
    if (v === null || v === "") return null;
    const d = fimDoDiaEmBrasilia(v);
    if (!d) ctx.addIssue({ code: "custom", message: "Data de expiração inválida (use DD/MM/AAAA)." });
    return d ?? z.NEVER;
  });

export const matricularSchema = z
  .strictObject({
    membroIds: z.array(idSchema).max(200, "No máximo 200 pessoas por vez.").default([]),
    grupoId: idSchema.nullable().default(null),
    produtoIds: z.array(idSchema).min(1, "Escolha ao menos um produto.").max(20, "No máximo 20 produtos por vez."),
    expiraEm: expiracaoOpcional,
  })
  .refine((e) => (e.membroIds.length > 0) !== (e.grupoId !== null), "Escolha as pessoas OU um grupo.");

export const motivoCancelamento = z
  .string()
  .trim()
  .min(3, "Informe o motivo (mínimo de 3 caracteres).")
  .max(300, "Motivo muito longo (máximo de 300 caracteres).")
  .regex(/^[^<>]+$/, "Motivo com caracteres inválidos.");

export const cancelarMatriculaSchema = z.strictObject({ matriculaId: idSchema, versao: versaoSchema, motivo: motivoCancelamento });
export const alterarExpiracaoSchema = z.strictObject({ matriculaId: idSchema, versao: versaoSchema, expiraEm: expiracaoOpcional });

/** Linha do CSV de matriculas ja normalizada (`expira_em` vira Date ou null; `grupo` vazio = sem grupo). */
export const linhaCsvMatriculaSchema = z.strictObject({
  nome: nomePessoa,
  email: emailPessoa,
  produto: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Informe o produto (código ou endereço).")
    .max(80, "Produto inválido.")
    .regex(RE_REF_PRODUTO, "Produto inválido (use o código ou o endereço do produto)."),
  expira_em: expiracaoOpcional,
  grupo: z.union([z.literal(""), nomeGrupo]),
});
export type LinhaCsvMatricula = z.infer<typeof linhaCsvMatriculaSchema>;
