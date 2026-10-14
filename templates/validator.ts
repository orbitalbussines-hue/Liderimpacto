/**
 * TEMPLATE-OURO: validador Zod.
 * Copie para src/lib/validators/<entidade>.ts. `strictObject` recusa campo
 * extra — papel, dono e preco nunca entram pelo corpo da requisicao.
 */
import { z } from "zod";

export const idSchema = z.uuid("Identificador invalido.");
export const instanteSchema = z.date("Data de controle invalida.");

export const lancamentoSchema = z.strictObject({
  contrato_id: z.uuid("Contrato invalido."),
  descricao: z.string().trim().min(3, "Descricao muito curta.").max(500),
  // numeric(14,2) em modo string: regex garante o formato antes do banco.
  valor: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Valor invalido. Use o formato 1234.56"),
});

export const lancamentoEdicaoSchema = lancamentoSchema.omit({ contrato_id: true });
