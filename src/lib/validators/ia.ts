import { z } from "zod";
import { LIMITES_ASSISTENTE } from "@/lib/assistente/regras";
import { LIMITES_CONHECIMENTO } from "@/lib/conhecimento/regras";
import { idSchema, versaoSchema } from "./membros";

/** Base de conhecimento e assistente do professor (ADR-0014, RN-190 a RN-197). */

/** Controles C0/C1 (menos \n e \t), largura zero e bidi: saem antes de validar. */
const INVISIVEIS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
const textoPuro = (s: string) => s.replace(INVISIVEIS, "").replace(/\r\n?/g, "\n");

export const tituloTextoSchema = z
  .string()
  .transform(textoPuro)
  .pipe(z.string().trim().min(2, "Informe o título (mínimo de 2 caracteres).").max(LIMITES_CONHECIMENTO.tituloTexto, `Título: máximo de ${LIMITES_CONHECIMENTO.tituloTexto} caracteres.`));

export const conteudoTextoSchema = z
  .string()
  .transform(textoPuro)
  .pipe(
    z
      .string()
      .trim()
      .min(20, "Escreva o conteúdo (mínimo de 20 caracteres).")
      .max(LIMITES_CONHECIMENTO.texto, `Conteúdo: máximo de ${LIMITES_CONHECIMENTO.texto.toLocaleString("pt-BR")} caracteres.`),
  );

export const criarTextoSchema = z.strictObject({ titulo: tituloTextoSchema, texto: conteudoTextoSchema, produtoId: idSchema.nullable() });
export const salvarTextoSchema = z.strictObject({ documentoId: idSchema, versao: versaoSchema, titulo: tituloTextoSchema, texto: conteudoTextoSchema, produtoId: idSchema.nullable() });
export const versaoDocumentoSchema = z.strictObject({ documentoId: idSchema, versao: versaoSchema });
export const incluirDocumentoSchema = z.strictObject({ documentoId: idSchema, versao: versaoSchema, incluir: z.boolean() });
export const testarBuscaSchema = z.strictObject({ pergunta: z.string().trim().min(2, "Escreva uma pergunta.").max(LIMITES_ASSISTENTE.pergunta, "Pergunta longa demais.") });

export const configAssistenteSchema = z.strictObject({
  versao: versaoSchema.nullable(),
  ligado: z.boolean(),
  nome: z
    .string()
    .transform(textoPuro)
    .pipe(
      z
        .string()
        .trim()
        .min(2, "Nome do assistente: mínimo de 2 caracteres.")
        .max(LIMITES_ASSISTENTE.nome, `Nome do assistente: máximo de ${LIMITES_ASSISTENTE.nome} caracteres.`)
        .regex(/^[^<>"]*$/, "Nome do assistente com caracteres inválidos."),
    ),
  instrucoes: z
    .string()
    .transform(textoPuro)
    .pipe(z.string().trim().max(LIMITES_ASSISTENTE.instrucoes, `Instruções de tom: máximo de ${LIMITES_ASSISTENTE.instrucoes} caracteres.`)),
  limiteDiario: z
    .number()
    .int("Limite diário: número inteiro.")
    .min(1, "Limite diário: mínimo de 1 pergunta.")
    .max(LIMITES_ASSISTENTE.limiteDiarioMax, `Limite diário: máximo de ${LIMITES_ASSISTENTE.limiteDiarioMax} perguntas.`),
  todosOsCursos: z.boolean(),
  produtos: z.array(idSchema).max(200, "Cursos demais."),
});

export const apagarConversaSchema = z.strictObject({ conversaId: idSchema, versao: versaoSchema });
