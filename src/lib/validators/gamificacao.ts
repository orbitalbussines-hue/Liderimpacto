import { z } from "zod";
import { METAS_DESAFIO, PUBLICOS_DESAFIO } from "@/lib/db/schema/_enums";
import { esquemaNiveis } from "@/lib/gamificacao/regras";
import { idSchema, versaoSchema } from "./membros";

/**
 * Validadores da gamificação (RN-144 a RN-147). Fonte única: actions (servidor) e telas (cliente).
 * Limites iguais aos CHECKs de `src/lib/db/schema/gamificacao.ts`.
 */

const pontosDaAcao = z.number().int("Pontos inteiros.").min(0, "Pontos de 0 a 10.000.").max(10_000, "Pontos de 0 a 10.000.");

export const configGamificacaoSchema = z.strictObject({
  ligada: z.boolean(),
  pontos: z.strictObject({ aulaConcluida: pontosDaAcao, cursoConcluido: pontosDaAcao, avaliacaoAprovada: pontosDaAcao, publicacaoComunidade: pontosDaAcao }),
  niveis: esquemaNiveis,
  /** `updated_at` da configuração que a tela abriu; nulo = nunca salva (cria a linha). */
  versao: versaoSchema.nullable(),
});

/** Texto livre que vai para a tela: sem caractere de controle (a descrição guarda só 
 e 	). */
const RE_SEM_CONTROLE = /^[^\p{Cc}]*$/u;
const instante = z.iso.datetime({ offset: true, message: "Data inválida." }).transform((v) => new Date(v));

export const camposDesafioSchema = z
  .strictObject({
    titulo: z.string().trim().min(3, "Título com 3 a 120 caracteres.").max(120, "Título com 3 a 120 caracteres.").regex(RE_SEM_CONTROLE, "Título com caracteres inválidos."),
    descricao: z.string().max(2000, "Descrição com até 2.000 caracteres.").transform((v) => v.replace(/[^\P{Cc}\n\t]/gu, "").trim()),
    inicioEm: instante,
    fimEm: instante,
    metaTipo: z.enum(METAS_DESAFIO, "Escolha a meta."),
    metaQuantidade: z.number().int().min(1, "Meta de 1 a 1.000.").max(1000, "Meta de 1 a 1.000.").nullable(),
    metaProdutoId: idSchema.nullable(),
    metaAvaliacaoId: idSchema.nullable(),
    pontosBonus: pontosDaAcao,
    recompensa: z
      .string()
      .trim()
      .max(200, "Recompensa com até 200 caracteres.")
      .regex(RE_SEM_CONTROLE, "Recompensa com caracteres inválidos.")
      .refine((v) => v === "" || v.length >= 3, "Recompensa com 3 a 200 caracteres (ou deixe em branco).")
      .transform((v) => v || null),
    publico: z.enum(PUBLICOS_DESAFIO),
    grupoIds: z.array(idSchema).max(50, "No máximo 50 grupos."),
  })
  .refine((c) => c.fimEm.getTime() > c.inicioEm.getTime(), { message: "O fim precisa ser depois do início.", path: ["fimEm"] })
  .refine((c) => !["AULAS_CONCLUIDAS", "PUBLICACOES_COMUNIDADE"].includes(c.metaTipo) || c.metaQuantidade !== null, { message: "Informe a quantidade da meta.", path: ["metaQuantidade"] })
  .refine((c) => c.metaTipo !== "CURSO_CONCLUIDO" || c.metaProdutoId !== null, { message: "Escolha o curso da meta.", path: ["metaProdutoId"] })
  .refine((c) => c.metaTipo !== "AVALIACAO_APROVADA" || c.metaAvaliacaoId !== null, { message: "Escolha a avaliação da meta.", path: ["metaAvaliacaoId"] })
  .refine((c) => c.publico !== "GRUPOS" || c.grupoIds.length > 0, { message: "Escolha ao menos um grupo.", path: ["grupoIds"] })
  // Só o campo da meta escolhida vale (o CHECK do banco exige os outros nulos).
  .transform((c) => ({
    ...c,
    metaQuantidade: c.metaTipo === "AULAS_CONCLUIDAS" || c.metaTipo === "PUBLICACOES_COMUNIDADE" ? c.metaQuantidade : null,
    metaProdutoId: c.metaTipo === "CURSO_CONCLUIDO" ? c.metaProdutoId : null,
    metaAvaliacaoId: c.metaTipo === "AVALIACAO_APROVADA" ? c.metaAvaliacaoId : null,
    grupoIds: c.publico === "GRUPOS" ? [...new Set(c.grupoIds)] : [],
  }));

export type CamposDesafio = z.infer<typeof camposDesafioSchema>;

export const salvarDesafioSchema = z.strictObject({
  /** Sem id = criar (rascunho). */
  desafioId: idSchema.nullable(),
  versao: versaoSchema.nullable(),
  campos: camposDesafioSchema,
});

export const alvoDesafioSchema = z.strictObject({ desafioId: idSchema, versao: versaoSchema });

export const recompensaSchema = z.strictObject({ participacaoId: idSchema, versao: versaoSchema });

export const ajustePontosSchema = z.strictObject({
  membroId: idSchema,
  pontos: z.number().int("Pontos inteiros.").min(-100_000, "Até 100.000 pontos.").max(100_000, "Até 100.000 pontos.").refine((n) => n !== 0, "Informe um ajuste diferente de zero."),
  justificativa: z.string().trim().min(5, "Explique o ajuste (5 a 500 caracteres).").max(500, "Explique o ajuste (5 a 500 caracteres).").regex(/^[^\p{Cc}]+$/u, "Justificativa com caracteres inválidos."),
});
