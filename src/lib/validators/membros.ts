import { z } from "zod";
import { PAPEIS_CRIADOR, STATUS_MEMBRO, TIPOS_GRUPO } from "@/lib/db/schema/_enums";

/**
 * Validadores de membros, grupos e criadores. Fonte unica: actions (servidor) e telas
 * (cliente, para o erro aparecer antes do envio) usam os MESMOS schemas.
 */

/** Formato de e-mail aceito no cadastro e no CSV (o z.email() confere de novo). */
export const RE_EMAIL = /^[^\s@,;"<>]+@[^\s@,;"<>]+\.[^\s@,;"<>]{2,}$/;
/** Nome de pessoa: letras (com acento), espaco, apostrofo, ponto e hifen. */
export const RE_NOME_PESSOA = /^[\p{L}][\p{L}\p{M} .'-]*$/u;
/** Nome de grupo: letras, numeros e pontuacao simples, sem < > (vai para a tela). */
export const RE_NOME_GRUPO = /^[^<>]+$/;

export const nomePessoa = z
  .string()
  .trim()
  .min(2, "Informe o nome (mínimo de 2 letras).")
  .max(120, "Nome muito longo (máximo de 120 caracteres).")
  .regex(RE_NOME_PESSOA, "Nome com caracteres inválidos.");

export const emailPessoa = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "E-mail muito longo.")
  .regex(RE_EMAIL, "E-mail inválido.")
  .pipe(z.email("E-mail inválido."));

export const nomeGrupo = z
  .string()
  .trim()
  .min(2, "Informe o nome do grupo (mínimo de 2 caracteres).")
  .max(80, "Nome do grupo muito longo (máximo de 80 caracteres).")
  .regex(RE_NOME_GRUPO, "Nome do grupo com caracteres inválidos.");

export const idSchema = z.uuid("Registro inválido.");
/** `updated_at` que a tela recebeu (ISO): a trava de colisao compara exato. */
export const versaoSchema = z.iso.datetime({ offset: true, message: "Versão do registro inválida." }).transform((v) => new Date(v));
export const papelSchema = z.enum(PAPEIS_CRIADOR, "Papel inválido.");
export const statusMembroSchema = z.enum(STATUS_MEMBRO, "Situação inválida.");
export const tipoGrupoSchema = z.enum(TIPOS_GRUPO, "Tipo de grupo inválido.");

export const cadastroMembroSchema = z.strictObject({
  nome: nomePessoa,
  email: emailPessoa,
  papel: papelSchema,
  grupoIds: z.array(idSchema).max(50, "Grupos demais.").default([]),
});
export type CadastroMembro = z.infer<typeof cadastroMembroSchema>;

/** Linha do CSV ja normalizada. `grupo` vazio = sem grupo. */
export const linhaCsvSchema = z.strictObject({
  nome: nomePessoa,
  email: emailPessoa,
  grupo: z.union([z.literal(""), nomeGrupo]),
});
export type LinhaCsv = z.infer<typeof linhaCsvSchema>;
