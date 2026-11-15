import { z } from "zod";
import { ErroDeNegocio } from "@/lib/acao";
import { normalizarTexto } from "@/lib/comunidade/regras";
import { videoSchema } from "@/lib/paginas/config";

/**
 * Conteúdo da aula em blocos (RN-275): texto, imagem enviada (IMAGEM do criador) e vídeo do
 * YouTube/Vimeo, na ordem que o criador montou. PURO: action, consultas e telas usam o mesmo
 * schema. Tudo é TEXTO na tela (o React escapa); vídeo só por id, no player de domínio fixo
 * (`urlDoPlayer`, ADR-0022). `descricao` continua existindo e é DERIVADA dos blocos TEXTO.
 */

export const MAX_BLOCOS_CONTEUDO = 40;

const textoSchema = z.strictObject({
  tipo: z.literal("TEXTO"),
  texto: z
    .string({ error: "Texto: inválido." })
    .transform(normalizarTexto)
    .pipe(z.string().min(1, "Texto: escreva algo ou remova o bloco.").max(5000, "Texto: máximo de 5000 caracteres por bloco.")),
});

const imagemSchema = z.strictObject({
  tipo: z.literal("IMAGEM"),
  arquivoId: z.uuid("Imagem: envie a imagem de novo."),
  alt: z.string({ error: "Imagem: descreva a imagem." }).trim().min(1, "Imagem: descreva a imagem (texto alternativo).").max(200, "Imagem: descrição com no máximo 200 caracteres."),
  legenda: z.string().trim().max(200, "Imagem: legenda com no máximo 200 caracteres.").optional(),
});

export const conteudoAulaSchema = z
  .array(z.discriminatedUnion("tipo", [textoSchema, imagemSchema, videoSchema], { error: "Bloco inválido." }))
  .max(MAX_BLOCOS_CONTEUDO, `Conteúdo: no máximo ${MAX_BLOCOS_CONTEUDO} blocos.`);

export type BlocoConteudo = z.infer<typeof conteudoAulaSchema>[number];

/** Ids únicos das imagens do conteúdo (ordem de aparição). */
export const imagensDoConteudo = (b: readonly BlocoConteudo[] | null | undefined): string[] => [
  ...new Set((b ?? []).flatMap((x) => (x.tipo === "IMAGEM" ? [x.arquivoId] : []))),
];

/** `descricao` derivada: os blocos TEXTO separados por linha em branco (cabe no limite da descrição). */
export const descricaoDoConteudo = (b: readonly BlocoConteudo[] | null | undefined): string =>
  (b ?? [])
    .flatMap((x) => (x.tipo === "TEXTO" ? [x.texto] : []))
    .join("\n\n")
    .slice(0, 5000);

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Resumo para a trilha: "vazio" ou "5 blocos (2 imagens, 1 vídeo)". */
export function resumoDoConteudo(b: readonly BlocoConteudo[] | null | undefined): string {
  if (!b?.length) return "vazio";
  const imagens = b.filter((x) => x.tipo === "IMAGEM").length;
  const videos = b.filter((x) => x.tipo === "VIDEO").length;
  const extras = [imagens && plural(imagens, "imagem", "imagens"), videos && plural(videos, "vídeo", "vídeos")].filter(Boolean);
  return `${plural(b.length, "bloco", "blocos")}${extras.length ? ` (${extras.join(", ")})` : ""}`;
}

/** Troca o texto do primeiro bloco TEXTO (ou põe um no topo, se couber). Usado pelo estúdio IA. */
export function trocarPrimeiroTexto(b: readonly BlocoConteudo[], texto: string): BlocoConteudo[] {
  const i = b.findIndex((x) => x.tipo === "TEXTO");
  if (i < 0 && b.length >= MAX_BLOCOS_CONTEUDO)
    throw new ErroDeNegocio(`O conteúdo já tem ${MAX_BLOCOS_CONTEUDO} blocos e nenhum de texto: remova um bloco no editor para receber a descrição.`);
  if (i < 0) return [{ tipo: "TEXTO", texto }, ...b];
  return b.map((x, j) => (j === i ? { tipo: "TEXTO", texto } : x));
}

/** O jsonb reordena as chaves: compara por uma lista fixa de chaves. */
const CHAVES = ["tipo", "texto", "arquivoId", "alt", "legenda", "provedor", "id"];
export const mesmoConteudo = (a: readonly BlocoConteudo[] | null | undefined, b: readonly BlocoConteudo[] | null | undefined) =>
  JSON.stringify(a?.length ? a : null, CHAVES) === JSON.stringify(b?.length ? b : null, CHAVES);
