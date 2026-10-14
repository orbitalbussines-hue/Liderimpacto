import { z } from "zod";
import { STATUS_AVALIACAO, STATUS_TRILHA, TIPOS_AVALIACAO, TIPOS_ITEM_TRILHA, TIPOS_QUESTAO } from "@/lib/db/schema/_enums";
import { IDS_OPCOES, OPCOES_VF } from "@/lib/avaliacoes/regras";
import { idSchema, novaOrdemSchema, tituloSchema, versaoSchema } from "./catalogo";

/**
 * Validadores do passo 7 (avaliações, certificados, trilhas). Fonte única: tela e action usam
 * os MESMOS. Toda entrada de action é `strictObject` (campo a mais = recusa).
 */

export { idSchema, novaOrdemSchema, tituloSchema, versaoSchema };

const RE_SEM_TAG = /^[^<>]*$/;
const textoLivre = (rotulo: string, max: number) =>
  z.string().trim().max(max, `${rotulo}: máximo de ${max} caracteres.`).regex(RE_SEM_TAG, `${rotulo} com caracteres inválidos (< >).`);

// ------------------------------------------------------------------ avaliação

/** Campos editáveis da avaliação (criar e salvar). Regras e padrões: RN-123. */
export const camposAvaliacaoSchema = z
  .strictObject({
    titulo: tituloSchema,
    tipo: z.enum(TIPOS_AVALIACAO, "Tipo de avaliação inválido."),
    moduloId: idSchema.nullable(),
    instrucoes: textoLivre("Instruções", 2000).default(""),
    notaMinima: z.int("Nota mínima inválida.").min(0, "Nota mínima entre 0 e 100.").max(100, "Nota mínima entre 0 e 100.").default(70),
    tentativasMax: z.int("Tentativas inválidas.").min(0, "Tentativas entre 0 (ilimitado) e 50.").max(50, "Tentativas entre 0 (ilimitado) e 50.").default(3),
    tempoLimiteMin: z.int("Tempo inválido.").min(1, "Tempo entre 1 e 600 minutos.").max(600, "Tempo entre 1 e 600 minutos.").nullable().default(null),
    obrigatoriaParaCertificado: z.boolean().default(false),
    liberaProximoModulo: z.boolean().default(false),
    embaralhar: z.boolean().default(false),
    exigeAulasConcluidas: z.boolean().default(true),
  })
  .refine((a) => !a.liberaProximoModulo || a.moduloId !== null, { message: "Só avaliação de módulo pode liberar o próximo módulo.", path: ["liberaProximoModulo"] });

export const criarAvaliacaoSchema = z.strictObject({ produtoId: idSchema, campos: camposAvaliacaoSchema });
export const salvarAvaliacaoSchema = z.strictObject({ avaliacaoId: idSchema, versao: versaoSchema, campos: camposAvaliacaoSchema });
export const situacaoAvaliacaoSchema = z.strictObject({ avaliacaoId: idSchema, versao: versaoSchema, status: z.enum(STATUS_AVALIACAO, "Situação inválida.") });

// ------------------------------------------------------------------ questão

const opcaoEntradaSchema = z.strictObject({
  texto: z.string().trim().min(1, "Opção vazia.").max(500, "Opção: máximo de 500 caracteres.").regex(RE_SEM_TAG, "Opção com caracteres inválidos (< >)."),
  correta: z.boolean(),
});

/**
 * Questão como a tela manda: opções na ordem, cada uma com `correta`. Sai no formato do banco:
 * `opcoes` ({ id, texto }, ids por posição) e `gabarito` (ids das corretas), SEPARADOS.
 * UNICA e V/F: exatamente 1 correta; MULTIPLA: ao menos 1. V/F: 2 opções, textos fixos.
 */
export const questaoSchema = z
  .strictObject({
    tipo: z.enum(TIPOS_QUESTAO, "Tipo de questão inválido."),
    enunciado: z.string().trim().min(3, "Enunciado: mínimo de 3 caracteres.").max(4000, "Enunciado: máximo de 4000 caracteres."),
    opcoes: z.array(opcaoEntradaSchema).min(2, "Ao menos 2 opções.").max(8, "No máximo 8 opções."),
    peso: z.int("Peso inválido.").min(1, "Peso entre 1 e 100.").max(100, "Peso entre 1 e 100.").default(1),
    explicacao: textoLivre("Explicação", 2000).nullable().default(null),
  })
  .superRefine((q, ctx) => {
    const corretas = q.opcoes.filter((o) => o.correta).length;
    if (corretas === 0) ctx.addIssue({ code: "custom", message: "Marque a opção correta.", path: ["opcoes"] });
    if (q.tipo !== "MULTIPLA" && corretas > 1) ctx.addIssue({ code: "custom", message: "Esta questão aceita só uma opção correta.", path: ["opcoes"] });
    if (q.tipo === "VERDADEIRO_FALSO" && q.opcoes.length !== 2) ctx.addIssue({ code: "custom", message: "Verdadeiro ou falso tem exatamente 2 opções.", path: ["opcoes"] });
    if (new Set(q.opcoes.map((o) => o.texto.toLowerCase())).size !== q.opcoes.length) ctx.addIssue({ code: "custom", message: "Duas opções com o mesmo texto.", path: ["opcoes"] });
  })
  .transform((q) => {
    const textos = q.tipo === "VERDADEIRO_FALSO" ? OPCOES_VF : q.opcoes.map((o) => o.texto);
    return {
      tipo: q.tipo,
      enunciado: q.enunciado,
      opcoes: q.opcoes.map((_, i) => ({ id: IDS_OPCOES[i], texto: textos[i] })),
      gabarito: q.opcoes.flatMap((o, i) => (o.correta ? [IDS_OPCOES[i] as string] : [])),
      peso: q.peso,
      explicacao: q.explicacao || null,
    };
  });

export const criarQuestaoSchema = z.strictObject({ avaliacaoId: idSchema, questao: questaoSchema });
export const salvarQuestaoSchema = z.strictObject({ questaoId: idSchema, versao: versaoSchema, questao: questaoSchema });
export const removerQuestaoSchema = z.strictObject({ questaoId: idSchema, versao: versaoSchema });
export const reordenarQuestoesSchema = z.strictObject({ avaliacaoId: idSchema, itens: novaOrdemSchema });

// ------------------------------------------------------------------ tentativa (aluno)

export const iniciarTentativaSchema = z.strictObject({ avaliacaoId: idSchema });
/** Autosave de UMA questão: ids das opções marcadas ([] = desmarcou). */
export const responderSchema = z.strictObject({
  tentativaId: idSchema,
  questaoId: idSchema,
  opcoes: z
    .array(z.enum(IDS_OPCOES, "Opção inválida."))
    .max(8, "Opções demais.")
    .refine((l) => new Set(l).size === l.length, "Opção repetida."),
});
export const finalizarTentativaSchema = z.strictObject({ tentativaId: idSchema });
export const concederTentativaSchema = z.strictObject({
  avaliacaoId: idSchema,
  membroId: idSchema,
  quantidade: z.int("Quantidade inválida.").min(1, "Conceda de 1 a 10 tentativas.").max(10, "Conceda de 1 a 10 tentativas.").default(1),
  motivo: z.string().trim().min(3, "Motivo: mínimo de 3 caracteres.").max(500, "Motivo: máximo de 500 caracteres."),
});

// ------------------------------------------------------------------ certificados

const corSchema = z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, "Cor inválida: use #RGB ou #RRGGBB.").nullable();
/** Só as variáveis conhecidas entre chaves. */
const RE_VARIAVEL = /\{([^}]*)\}/g;
export const VARIAVEIS_CERTIFICADO = ["nome", "curso", "carga_horaria", "data"] as const;

export const modeloCertificadoSchema = z.strictObject({
  /** Nulo = modelo padrão do criador. */
  produtoId: idSchema.nullable(),
  /** Versão do modelo existente (trava); nula = criar. */
  versao: versaoSchema.nullable(),
  titulo: tituloSchema,
  texto: z
    .string()
    .trim()
    .min(10, "Texto: mínimo de 10 caracteres.")
    .max(600, "Texto: máximo de 600 caracteres.")
    .regex(RE_SEM_TAG, "Texto com caracteres inválidos (< >).")
    .refine((t) => [...t.matchAll(RE_VARIAVEL)].every((m) => (VARIAVEIS_CERTIFICADO as readonly string[]).includes(m[1])), "Variável desconhecida. Use {nome}, {curso}, {carga_horaria} ou {data}.")
    .refine((t) => t.includes("{nome}"), "O texto precisa ter {nome}."),
  assinaturaNome: z.string().trim().min(2, "Assinatura: mínimo de 2 caracteres.").max(120, "Assinatura: máximo de 120 caracteres.").regex(RE_SEM_TAG, "Assinatura com caracteres inválidos."),
  assinaturaCargo: textoLivre("Cargo", 120).default(""),
  cor: corSchema.default(null),
});

export const certificadoIdSchema = z.strictObject({ certificadoId: idSchema });
export const revogarCertificadoSchema = z.strictObject({
  certificadoId: idSchema,
  versao: versaoSchema,
  motivo: z.string().trim().min(3, "Motivo: mínimo de 3 caracteres.").max(500, "Motivo: máximo de 500 caracteres."),
});
/** Código digitado: aceita minúsculas, espaços e hífens (normalizado em src/lib/certificados/codigo.ts). */
export const codigoDigitadoSchema = z.string().trim().min(10, "Código inválido.").max(20, "Código inválido.");

// ------------------------------------------------------------------ trilhas

export const camposTrilhaSchema = z.strictObject({
  titulo: tituloSchema,
  descricao: textoLivre("Descrição", 2000).default(""),
  tag: textoLivre("Tag", 40).default(""),
});
export const criarTrilhaSchema = camposTrilhaSchema;
export const salvarTrilhaSchema = z.strictObject({ trilhaId: idSchema, versao: versaoSchema, campos: camposTrilhaSchema });
export const capaTrilhaSchema = z.strictObject({ trilhaId: idSchema, versao: versaoSchema, arquivoId: idSchema.nullable() });
export const situacaoTrilhaSchema = z.strictObject({ trilhaId: idSchema, versao: versaoSchema, status: z.enum(STATUS_TRILHA, "Situação inválida.") });
export const removerTrilhaSchema = z.strictObject({ trilhaId: idSchema, versao: versaoSchema });
export const adicionarItemTrilhaSchema = z.union([
  z.strictObject({ trilhaId: idSchema, tipo: z.literal(TIPOS_ITEM_TRILHA[0]), produtoId: idSchema, exigeAnterior: z.boolean().default(true) }),
  z.strictObject({ trilhaId: idSchema, tipo: z.literal(TIPOS_ITEM_TRILHA[1]), avaliacaoId: idSchema, exigeAnterior: z.boolean().default(true) }),
]);
export const salvarItemTrilhaSchema = z.strictObject({ itemId: idSchema, versao: versaoSchema, exigeAnterior: z.boolean() });
export const removerItemTrilhaSchema = z.strictObject({ itemId: idSchema, versao: versaoSchema });
export const reordenarItensTrilhaSchema = z.strictObject({ trilhaId: idSchema, itens: novaOrdemSchema });
