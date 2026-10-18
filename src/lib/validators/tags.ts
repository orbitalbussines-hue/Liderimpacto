import { z } from "zod";
import { idSchema, versaoSchema } from "./membros";

/** Tags de membros (RN-200). Mesmos schemas na action e na tela. */

/** Nome de tag: letras, números e pontuação simples, sem < > (vai para a tela). */
export const RE_NOME_TAG = /^[^<>]+$/;
export const RE_COR_TAG = /^#[0-9a-f]{6}$/;

export const nomeTag = z.string().trim().min(1, "Informe o nome da tag.").max(40, "Nome muito longo (máximo de 40).").regex(RE_NOME_TAG, "Nome com caracteres inválidos.");
export const corTag = z.string().trim().toLowerCase().regex(RE_COR_TAG, "Cor inválida.");

export const criarTagSchema = z.strictObject({ nome: nomeTag, cor: corTag });
export const salvarTagSchema = z.strictObject({ tagId: idSchema, versao: versaoSchema, nome: nomeTag, cor: corTag });
export const excluirTagSchema = z.strictObject({ tagId: idSchema, versao: versaoSchema });
/** Aplicar/remover em lote (seleção da lista de membros). */
export const marcarTagSchema = z.strictObject({ tagId: idSchema, membroIds: z.array(idSchema).min(1, "Escolha ao menos um membro.").max(500, "Membros demais de uma vez.") });
