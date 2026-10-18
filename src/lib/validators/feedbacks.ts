import { z } from "zod";
import { idSchema } from "./membros";

/** Feedback de conteúdo (RN-202). Mesmos schemas na action e na tela. */

/** Texto puro, até 500; vazio = sem comentário. Caracteres de controle fora (vai para a tela como texto). */
export const comentarioFeedbackSchema = z
  .string()
  .trim()
  .max(500, "Comentário muito longo (máximo de 500).")
  .regex(/^[^\p{Cc}]*$/u, "Comentário com caracteres inválidos.")
  .transform((t) => (t === "" ? null : t))
  .nullable()
  .default(null);

export const darFeedbackSchema = z.strictObject({ aulaId: idSchema, util: z.boolean(), comentario: comentarioFeedbackSchema });
export const removerFeedbackSchema = z.strictObject({ aulaId: idSchema });
