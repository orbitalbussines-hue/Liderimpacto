import { z } from "zod";
import { FINALIDADES_ARQUIVO, STATUS_MODULO, STATUS_PRODUTO, TIPOS_PRODUTO } from "@/lib/db/schema/_enums";
import { idSchema, versaoSchema } from "./membros";

/**
 * Validadores do catalogo (produtos, modulos, aulas, materiais) e do envio de arquivos.
 * Fonte unica: actions (servidor) e telas (cliente) usam os MESMOS schemas e funcoes.
 */

export { idSchema, versaoSchema };

/** Texto que vai para a tela: sem < > (defesa extra; o React ja escapa). */
const RE_TEXTO_SEGURO = /^[^<>]*$/;

const texto = (rotulo: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, min > 1 ? `${rotulo}: mínimo de ${min} caracteres.` : `Informe ${rotulo.toLowerCase()}.`)
    .max(max, `${rotulo}: máximo de ${max} caracteres.`)
    .regex(RE_TEXTO_SEGURO, `${rotulo} com caracteres inválidos (< >).`);

export const tituloSchema = texto("Título", 2, 160);
export const descricaoSchema = z.string().trim().max(5000, "Descrição: máximo de 5000 caracteres.");
export const nomeMaterialSchema = texto("Nome do material", 1, 160);

/** Endereco do produto na area: minusculas, numeros e hifens (sem hifen nas pontas ou duplo). */
export const RE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Endereço: mínimo de 2 caracteres.")
  .max(80, "Endereço: máximo de 80 caracteres.")
  .regex(RE_SLUG, "Endereço: use só letras minúsculas, números e hífens (ex.: lider-de-impacto).");

/** "Líder de Impacto 2.0!" -> "lider-de-impacto-2-0". */
export function sugerirSlug(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

export const tipoProdutoSchema = z.enum(TIPOS_PRODUTO, "Tipo inválido.");
export const statusProdutoSchema = z.enum(STATUS_PRODUTO, "Situação inválida.");
export const statusModuloSchema = z.enum(STATUS_MODULO, "Situação do módulo inválida.");
export const corCursoSchema = z
  .string()
  .regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, "Cor inválida: use #RGB ou #RRGGBB.")
  .nullable();

/** Tempo "mm:ss" ou "h:mm:ss" -> segundos. `null` = formato invalido. */
export function lerTempo(entrada: string): number | null {
  const m = /^(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)$/.exec(entrada.trim());
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Segundos -> "mm:ss" (ou "h:mm:ss" a partir de 1 h). */
export function formatarTempo(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const [h, m, ss] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  const dois = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${dois(m)}:${dois(ss)}` : `${dois(m)}:${dois(ss)}`;
}

export const capituloSchema = z.strictObject({
  inicioSeg: z.int("Tempo do capítulo inválido.").min(0, "Tempo do capítulo inválido.").max(24 * 3600, "Capítulo além de 24 h."),
  titulo: texto("Título do capítulo", 1, 120),
});

/** Lista de capitulos: sem tempo repetido, sempre gravada em ordem crescente. */
export const capitulosSchema = z
  .array(capituloSchema)
  .max(200, "Capítulos demais (máximo de 200).")
  .refine((l) => new Set(l.map((c) => c.inicioSeg)).size === l.length, "Dois capítulos com o mesmo tempo.")
  .transform((l) => [...l].sort((a, b) => a.inicioSeg - b.inicioSeg));

/** Com a duracao conhecida (video processado), todo capitulo comeca antes do fim. `null` = ok. */
export function erroDeCapitulosNaDuracao(capitulos: readonly { inicioSeg: number }[], duracaoSeg: number | null): string | null {
  if (duracaoSeg === null) return null;
  const fora = capitulos.find((c) => c.inicioSeg >= duracaoSeg);
  return fora ? `O capítulo em ${formatarTempo(fora.inicioSeg)} passa da duração da aula (${formatarTempo(duracaoSeg)}).` : null;
}

/** Link de material: so https, com dominio. */
export const urlMaterialSchema = z
  .string()
  .trim()
  .max(2000, "Link longo demais.")
  .regex(/^https:\/\/[^\s<>]+$/i, "Use um link https://")
  .pipe(z.url({ protocol: /^https$/, hostname: z.regexes.domain, message: "Use um link https:// válido." }));

/** Material novo: arquivo ja confirmado (PDF/DOC, tipo vem do MIME no servidor) OU link https. */
export const materialNovoSchema = z.union([
  z.strictObject({ aulaId: idSchema, nome: nomeMaterialSchema, arquivoId: idSchema }),
  z.strictObject({ aulaId: idSchema, nome: nomeMaterialSchema, url: urlMaterialSchema }),
]);

/** Data de liberacao (ISO com fuso) ou nula. */
export const liberaEmSchema = z.iso
  .datetime({ offset: true, message: "Data de liberação inválida." })
  .transform((v) => new Date(v))
  .nullable();

/** Nova ordem dos irmaos: TODOS os vivos, cada um com a versao que a tela viu (trava). */
export const novaOrdemSchema = z
  .array(z.strictObject({ id: idSchema, versao: versaoSchema }))
  .min(1, "Nada para reordenar.")
  .max(500, "Itens demais.")
  .refine((l) => new Set(l.map((i) => i.id)).size === l.length, "Item repetido na ordem.");

/** Pedido de URL de envio: a allowlist (src/lib/armazenamento/regras.ts) confere o resto. */
export const envioSchema = z.strictObject({
  finalidade: z.enum(FINALIDADES_ARQUIVO, "Finalidade inválida."),
  nome: z.string().trim().min(1, "Arquivo sem nome.").max(200, "Nome do arquivo longo demais."),
  mime: z.string().trim().toLowerCase().min(3, "Tipo de arquivo ausente.").max(120),
  tamanho: z.int("Tamanho inválido.").positive("Arquivo vazio."),
});
