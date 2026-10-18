import { z } from "zod";
import { idSchema, versaoSchema } from "./membros";

/** IA do Estúdio (RN-206). Mesmos schemas na action e na tela. */

export const gerarSugestaoSchema = z.strictObject({ aulaId: idSchema });

export const aplicarSugestaoSchema = z.discriminatedUnion("parte", [
  z.strictObject({ parte: z.literal("DESCRICAO"), sugestaoId: idSchema, versao: versaoSchema, aulaVersao: versaoSchema }),
  z.strictObject({ parte: z.literal("CAPITULOS"), sugestaoId: idSchema, versao: versaoSchema, aulaVersao: versaoSchema }),
  z.strictObject({
    parte: z.literal("PERGUNTAS"),
    sugestaoId: idSchema,
    versao: versaoSchema,
    avaliacaoId: idSchema,
    indices: z.array(z.int().min(0).max(9)).min(1, "Escolha ao menos uma pergunta.").max(10).optional(),
  }),
]);

export const descartarSugestaoSchema = z.strictObject({ sugestaoId: idSchema, versao: versaoSchema });
