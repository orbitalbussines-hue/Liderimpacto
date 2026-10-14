import { z } from "zod";
import { DURACAO_MAXIMA_PROGRESSO_SEG } from "@/lib/db/schema/progresso";
import { idSchema, versaoSchema } from "./membros";

/**
 * Validadores da experiencia do aluno (favoritos, anotacoes, preferencias). O corpo da batida de
 * progresso e `esquemaBatida` (src/lib/progresso/regras.ts). Tela e action usam os MESMOS.
 */

export { idSchema, versaoSchema };

export const TEXTO_ANOTACAO_MAX = 2000;

/** Nota pessoal: texto livre (o React escapa na tela), 1 a 2000 caracteres. */
export const textoAnotacaoSchema = z
  .string({ error: "Escreva a anotação." })
  .trim()
  .min(1, "Escreva a anotação.")
  .max(TEXTO_ANOTACAO_MAX, `Anotação: máximo de ${TEXTO_ANOTACAO_MAX} caracteres.`);

/** Instante do vídeo (o player manda fracionado; guarda o segundo inteiro). */
export const tempoSegSchema = z
  .number({ error: "Tempo inválido." })
  .min(0, "Tempo inválido.")
  .max(DURACAO_MAXIMA_PROGRESSO_SEG, "Tempo inválido.")
  .transform((t) => Math.floor(t));

/** Alvo de "Minha lista": um produto OU uma aula. */
export const alvoFavoritoSchema = z.union([z.strictObject({ produtoId: idSchema }), z.strictObject({ aulaId: idSchema })], {
  error: "Informe o curso ou a aula.",
});

export const preferenciasSchema = z
  .strictObject({ reproducaoAutomatica: z.boolean().optional(), lembretes: z.boolean().optional(), aparecerNoRanking: z.boolean().optional() })
  .refine((p) => p.reproducaoAutomatica !== undefined || p.lembretes !== undefined || p.aparecerNoRanking !== undefined, "Nada para salvar.");
