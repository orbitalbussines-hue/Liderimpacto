import { z } from "zod";
import { RE_IDIOMA } from "@/lib/legendas/regras";
import { idSchema, versaoSchema } from "./membros";

/** Legendas da aula (RN-180). O conteúdo do arquivo é validado em `processarLegenda`. */

export const idiomaSchema = z.string().trim().regex(RE_IDIOMA, "Idioma inválido. Use, por exemplo, pt-BR, en ou es.");

export const rotuloLegendaSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome da legenda (ex.: Português).")
  .max(40, "Nome da legenda: máximo de 40 caracteres.")
  .regex(/^[^<>]*$/, "Nome da legenda com caracteres inválidos (< >).");

const versaoDaLegenda = z.strictObject({ legendaId: idSchema, versao: versaoSchema });

export const enviarLegendaSchema = z.strictObject({
  aulaId: idSchema,
  /** Arquivo bruto já confirmado no storage (finalidade LEGENDA). */
  arquivoId: idSchema,
  idioma: idiomaSchema,
  rotulo: rotuloLegendaSchema,
  /** Trocar: a legenda viva na versão que a tela abriu (o idioma passa a ser o dela). */
  substituir: versaoDaLegenda.nullable(),
});

export const removerLegendaSchema = versaoDaLegenda;
