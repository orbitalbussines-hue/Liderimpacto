import { z } from "zod";
import { PLATAFORMAS_INTEGRACAO } from "@/lib/db/schema/_enums";
import { PRODUTO_EXTERNO, SEGREDO_EXTERNO } from "@/lib/integracoes/regras";
import { idSchema, versaoSchema } from "./membros";

/** Integrações Hotmart/Eduzz (RN-230 a RN-236). Mesmos schemas na action e na tela. */

const segredo = z.string().trim().regex(SEGREDO_EXTERNO, "Cole o token exato, sem espaços (8 a 200 caracteres).");

export const conectarIntegracaoSchema = z.strictObject({ plataforma: z.enum(PLATAFORMAS_INTEGRACAO, "Plataforma inválida."), segredo });
export const trocarSegredoSchema = z.strictObject({ integracaoId: idSchema, versao: versaoSchema, segredo });
export const integracaoVersaoSchema = z.strictObject({ integracaoId: idSchema, versao: versaoSchema });

export const criarMapeamentoSchema = z.strictObject({
  integracaoId: idSchema,
  produtoExterno: z.string().trim().regex(PRODUTO_EXTERNO, "Id do produto: só letras, números, hífen ou sublinhado (até 64)."),
  nomeExterno: z
    .string()
    .trim()
    .max(120, "Nome muito longo (máximo de 120).")
    .regex(/^[^<>]*$/, "Nome com caracteres inválidos.")
    .transform((v) => v || null)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  produtoIds: z.array(idSchema).min(1, "Escolha ao menos um curso.").max(20, "No máximo 20 cursos por produto."),
  diasAcesso: z.number().int("Dias inteiros.").min(1, "Mínimo de 1 dia.").max(3650, "Máximo de 3650 dias.").nullable(),
});

export const mapeamentoVersaoSchema = z.strictObject({ mapeamentoId: idSchema, versao: versaoSchema });
export const reprocessarEventoSchema = z.strictObject({ eventoId: idSchema, versao: versaoSchema });
