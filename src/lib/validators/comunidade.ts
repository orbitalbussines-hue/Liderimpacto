import { z } from "zod";
import {
  ENQUETE_OPCOES_MAX,
  ENQUETE_OPCOES_MIN,
  MAX_IMAGENS_POST,
  MAX_PDFS_POST,
  MOTIVO_MAX,
  normalizarTexto,
  SILENCIO_DIAS_MAX,
  TEXTO_COMENTARIO_MAX,
  TEXTO_POST_MAX,
} from "@/lib/comunidade/regras";
import { ACESSOS_CANAL, QUEM_POSTA_CANAL } from "@/lib/db/schema/_enums";
import { idSchema, versaoSchema } from "./membros";

/**
 * Validadores da comunidade e das notificações (passo 8). Tela e action usam os MESMOS. Texto é
 * PURO: normalizado (sem controles, bidi ou largura zero) e guardado como veio — `<b>` fica `<b>`
 * literal e o React escapa na tela.
 */

export { idSchema, versaoSchema };

const textoPuro = (rotulo: string, max: number) =>
  z
    .string({ error: `Escreva ${rotulo}.` })
    .transform(normalizarTexto)
    .pipe(z.string().min(1, `Escreva ${rotulo}.`).max(max, `Máximo de ${max} caracteres.`));

export const textoPostSchema = textoPuro("a publicação", TEXTO_POST_MAX);
export const textoComentarioSchema = textoPuro("o comentário", TEXTO_COMENTARIO_MAX);
export const motivoSchema = z
  .string({ error: "Informe o motivo." })
  .transform(normalizarTexto)
  .pipe(z.string().min(3, "Informe o motivo (3 letras ou mais).").max(MOTIVO_MAX, `Motivo: máximo de ${MOTIVO_MAX} caracteres.`));

const instanteFuturoOpcional = z.iso
  .datetime({ offset: true, message: "Data inválida." })
  .transform((v) => new Date(v))
  .nullable()
  .default(null);

export const enqueteSchema = z.strictObject({
  pergunta: textoPuro("a pergunta da enquete", 200),
  opcoes: z
    .array(textoPuro("a opção", 80), { error: "Opções inválidas." })
    .min(ENQUETE_OPCOES_MIN, `A enquete precisa de ao menos ${ENQUETE_OPCOES_MIN} opções.`)
    .max(ENQUETE_OPCOES_MAX, `No máximo ${ENQUETE_OPCOES_MAX} opções.`)
    .refine((o) => new Set(o.map((x) => x.toLowerCase())).size === o.length, "Opções repetidas."),
  encerraEm: instanteFuturoOpcional,
});

export const publicarSchema = z.strictObject({
  canalId: idSchema,
  texto: textoPostSchema,
  aulaId: idSchema.nullable().default(null),
  anexoIds: z
    .array(idSchema)
    .max(MAX_IMAGENS_POST + MAX_PDFS_POST, `No máximo ${MAX_IMAGENS_POST} imagens e ${MAX_PDFS_POST} PDFs.`)
    .default([]),
  enquete: enqueteSchema.nullable().default(null),
});

export const editarPostSchema = z.strictObject({ postId: idSchema, versao: versaoSchema, texto: textoPostSchema });
export const removerPostSchema = z.strictObject({ postId: idSchema, versao: versaoSchema });
export const votarSchema = z.strictObject({ postId: idSchema, opcao: z.int("Opção inválida.").min(0, "Opção inválida.").max(ENQUETE_OPCOES_MAX - 1, "Opção inválida.") });

export const alvoPostOuComentarioSchema = z.union([z.strictObject({ postId: idSchema }), z.strictObject({ comentarioId: idSchema })], {
  error: "Informe a publicação ou o comentário.",
});

export const comentarSchema = z.union(
  [
    z.strictObject({ postId: idSchema, texto: textoComentarioSchema, paiId: idSchema.nullable().default(null) }),
    z.strictObject({ aulaId: idSchema, texto: textoComentarioSchema, paiId: idSchema.nullable().default(null) }),
  ],
  { error: "Informe a publicação ou a aula." },
);
export const editarComentarioSchema = z.strictObject({ comentarioId: idSchema, versao: versaoSchema, texto: textoComentarioSchema });
export const removerComentarioSchema = z.strictObject({ comentarioId: idSchema, versao: versaoSchema });

export const denunciarSchema = z.union(
  [z.strictObject({ postId: idSchema, motivo: motivoSchema }), z.strictObject({ comentarioId: idSchema, motivo: motivoSchema })],
  { error: "Informe a publicação ou o comentário." },
);

// ---------------------------------------------------------------- equipe

export const fixarSchema = z.strictObject({ postId: idSchema, versao: versaoSchema, fixar: z.boolean() });
export const ocultarSchema = z.union(
  [
    z.strictObject({ postId: idSchema, versao: versaoSchema, ocultar: z.literal(true), motivo: motivoSchema }),
    z.strictObject({ comentarioId: idSchema, versao: versaoSchema, ocultar: z.literal(true), motivo: motivoSchema }),
    z.strictObject({ postId: idSchema, versao: versaoSchema, ocultar: z.literal(false) }),
    z.strictObject({ comentarioId: idSchema, versao: versaoSchema, ocultar: z.literal(false) }),
  ],
  { error: "Dados da moderação inválidos." },
);
export const resolverDenunciaSchema = z.strictObject({
  denunciaId: idSchema,
  versao: versaoSchema,
  situacao: z.enum(["RESOLVIDA", "DESCARTADA"], "Situação inválida."),
  decisao: z
    .string()
    .transform(normalizarTexto)
    .pipe(z.string().max(MOTIVO_MAX, `Decisão: máximo de ${MOTIVO_MAX} caracteres.`))
    .nullable()
    .default(null)
    .transform((d) => d || null),
});
export const silenciarSchema = z.strictObject({
  membroId: idSchema,
  dias: z.int("Informe os dias.").min(1, "Mínimo de 1 dia.").max(SILENCIO_DIAS_MAX, `Máximo de ${SILENCIO_DIAS_MAX} dias.`),
  motivo: motivoSchema,
});

export const canalSchema = z
  .strictObject({
    nome: z.string({ error: "Informe o nome." }).transform(normalizarTexto).pipe(z.string().min(2, "Nome: 2 letras ou mais.").max(60, "Nome: máximo de 60 caracteres.")),
    descricao: z.string().transform(normalizarTexto).pipe(z.string().max(280, "Descrição: máximo de 280 caracteres.")).default(""),
    ordem: z.int("Ordem inválida.").min(1, "Ordem inválida.").max(999, "Ordem inválida.").default(1),
    acesso: z.enum(ACESSOS_CANAL, "Acesso inválido."),
    grupoId: idSchema.nullable().default(null),
    produtoId: idSchema.nullable().default(null),
    quemPosta: z.enum(QUEM_POSTA_CANAL, "Quem publica: inválido.").default("TODOS"),
  })
  .refine((c) => c.acesso !== "GRUPO" || c.grupoId, { message: "Escolha o grupo do canal.", path: ["grupoId"] })
  .refine((c) => c.acesso !== "PRODUTO" || c.produtoId, { message: "Escolha o curso do canal.", path: ["produtoId"] });

export const envioAnexoSchema = z.strictObject({
  nome: z.string().trim().min(1, "Arquivo sem nome.").max(200, "Nome do arquivo longo demais."),
  mime: z.string().trim().toLowerCase().min(3, "Tipo de arquivo ausente.").max(120),
  tamanho: z.int("Tamanho inválido.").positive("Arquivo vazio."),
});

/** Marcar lidas: ids (até 100) ou todas. */
export const marcarLidasSchema = z.union([z.strictObject({ ids: z.array(idSchema).min(1).max(100) }), z.strictObject({ todas: z.literal(true) })], {
  error: "Informe as notificações.",
});
