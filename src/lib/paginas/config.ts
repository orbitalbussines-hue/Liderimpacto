import { z } from "zod";

/**
 * Configuração de uma PÁGINA de venda/captura (ADR-0022, RN-240 a RN-243). PURO: serve à action (valida
 * o JSON que chega), ao servidor (render público e prévia) e ao editor (mesmas listas e rótulos). O JSON
 * NUNCA entra no banco sem passar por `configPaginaSchema` (`strictObject`: campo a mais = recusa).
 * Tudo que o criador escreve é TEXTO (o React escapa); links só `https://`; vídeo só YouTube/Vimeo por id.
 */

export const TIPOS_BLOCO = ["CAPA", "BENEFICIOS", "MODULOS", "AUTOR", "DEPOIMENTOS", "PRECO", "GARANTIA", "FAQ", "CHAMADA", "FORMULARIO"] as const;
export type TipoBloco = (typeof TIPOS_BLOCO)[number];

export const ROTULO_BLOCO: Record<TipoBloco, string> = {
  CAPA: "Capa",
  BENEFICIOS: "Benefícios",
  MODULOS: "Módulos do curso",
  AUTOR: "Sobre o autor",
  DEPOIMENTOS: "Depoimentos",
  PRECO: "Preço",
  GARANTIA: "Garantia",
  FAQ: "Perguntas frequentes",
  CHAMADA: "Chamada final",
  FORMULARIO: "Formulário de captura",
};

export const TEMAS_PAGINA = ["ESCURO", "CLARO"] as const;
export type TemaPagina = (typeof TEMAS_PAGINA)[number];

export const ACOES_BOTAO_PAGINA = ["PRECO", "FORMULARIO", "LINK"] as const;
export type AcaoBotaoPagina = (typeof ACOES_BOTAO_PAGINA)[number];
export const ROTULO_ACAO_BOTAO: Record<AcaoBotaoPagina, string> = { PRECO: "Ir para o preço", FORMULARIO: "Ir para o formulário", LINK: "Abrir link (https)" };

export const PROVEDORES_VIDEO = ["YOUTUBE", "VIMEO"] as const;
export type ProvedorVideo = (typeof PROVEDORES_VIDEO)[number];

export const MAX_BLOCOS = 30;

/** Slug da página na área (`/p/<slug>`): minúsculas, números e hífen, 2 a 60. */
export const RE_SLUG_PAGINA = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])$/;
/** Link de botão: só https, sem espaço nem aspas (o React escapa o atributo, isto barra `javascript:` e cia). */
export const RE_URL_HTTPS = /^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?::\d{2,5})?(?:[/?#][^\s<>"'`]*)?$/;
const RE_ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;
const RE_ID_VIMEO = /^\d{6,12}$/;
const RE_ID_BLOCO = /^[a-z0-9_-]{1,40}$/;

const uuid = z.uuid("Referência inválida.");
const texto = (rotulo: string, max: number, min = 0) =>
  z
    .string({ error: `${rotulo}: texto inválido.` })
    .trim()
    .min(min, `${rotulo}: obrigatório.`)
    .max(max, `${rotulo}: máximo de ${max} caracteres.`);
const lista = <T extends z.ZodType>(item: T, rotulo: string, max: number, min = 0) =>
  z
    .array(item)
    .min(min, `${rotulo}: adicione ao menos ${min}.`)
    .max(max, `${rotulo}: no máximo ${max}.`);

export const urlHttps = z.string().trim().max(500, "Link muito longo.").regex(RE_URL_HTTPS, "Link: use um endereço completo que comece com https://");

/** Id do vídeo a partir do que a pessoa cola (URL do YouTube/Vimeo ou o id puro). Outra origem = null. */
export function idDoVideo(entrada: string): { provedor: ProvedorVideo; id: string } | null {
  const s = entrada.trim();
  if (RE_ID_YOUTUBE.test(s)) return { provedor: "YOUTUBE", id: s };
  if (RE_ID_VIMEO.test(s)) return { provedor: "VIMEO", id: s };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^(www\.|m\.)/, "");
  const partes = u.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  if (host === "youtu.be") id = partes[0] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com")
    id = partes[0] === "watch" ? u.searchParams.get("v") : ["embed", "shorts", "live"].includes(partes[0] ?? "") ? (partes[1] ?? null) : null;
  if (id !== null) return RE_ID_YOUTUBE.test(id) ? { provedor: "YOUTUBE", id } : null;
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const n = partes.find((p) => RE_ID_VIMEO.test(p));
    return n ? { provedor: "VIMEO", id: n } : null;
  }
  return null;
}

/** Endereço do player embutido (domínio fixo; o id já passou pela regex). */
export const urlDoPlayer = (v: { provedor: ProvedorVideo; id: string }) =>
  v.provedor === "YOUTUBE" ? `https://www.youtube-nocookie.com/embed/${v.id}?rel=0` : `https://player.vimeo.com/video/${v.id}?dnt=1`;

const videoSchema = z
  .strictObject({ tipo: z.literal("VIDEO"), provedor: z.enum(PROVEDORES_VIDEO, { error: "Vídeo: só YouTube ou Vimeo." }), id: z.string().max(20, "Vídeo inválido.") })
  .refine((v) => (v.provedor === "YOUTUBE" ? RE_ID_YOUTUBE : RE_ID_VIMEO).test(v.id), { message: "Vídeo: cole o link do YouTube ou do Vimeo.", path: ["id"] });

const midiaSchema = z.union([z.strictObject({ tipo: z.literal("NENHUMA") }), z.strictObject({ tipo: z.literal("IMAGEM"), arquivoId: uuid }), videoSchema], { error: "Mídia da capa inválida." });
export type MidiaCapa = z.infer<typeof midiaSchema>;

const botaoSchema = z
  .strictObject({
    texto: texto("Texto do botão", 40, 1),
    acao: z.enum(ACOES_BOTAO_PAGINA, { error: "Ação do botão inválida." }),
    url: z.string().nullable(),
  })
  .superRefine((b, ctx) => {
    if (b.acao === "LINK" ? !urlHttps.safeParse(b.url ?? "").success : b.url !== null)
      ctx.addIssue({ code: "custom", message: "Link do botão: use um endereço completo que comece com https://", path: ["url"] });
  });
export type BotaoPagina = z.infer<typeof botaoSchema>;

const base = { id: z.string().regex(RE_ID_BLOCO, "Bloco inválido."), visivel: z.boolean() };

const capa = z.strictObject({ ...base, tipo: z.literal("CAPA"), titulo: texto("Título da capa", 120, 1), subtitulo: texto("Subtítulo", 300), midia: midiaSchema, botao: botaoSchema.nullable() });
const beneficios = z.strictObject({
  ...base,
  tipo: z.literal("BENEFICIOS"),
  titulo: texto("Título", 120),
  itens: lista(z.strictObject({ titulo: texto("Benefício", 80, 1), texto: texto("Descrição do benefício", 300) }), "Benefícios", 12, 1),
});
const modulos = z.strictObject({ ...base, tipo: z.literal("MODULOS"), titulo: texto("Título", 120), produtoId: uuid.nullable(), mostrarAulas: z.boolean() });
const autor = z.strictObject({ ...base, tipo: z.literal("AUTOR"), titulo: texto("Título", 120), nome: texto("Nome do autor", 80, 1), texto: texto("Sobre o autor", 1500, 1), imagemArquivoId: uuid.nullable() });
const depoimentos = z.strictObject({
  ...base,
  tipo: z.literal("DEPOIMENTOS"),
  titulo: texto("Título", 120),
  itens: lista(z.strictObject({ nome: texto("Nome", 80, 1), detalhe: texto("Detalhe", 80), texto: texto("Depoimento", 600, 1) }), "Depoimentos", 12, 1),
});
const preco = z.strictObject({
  ...base,
  tipo: z.literal("PRECO"),
  titulo: texto("Título", 120),
  ofertaId: uuid.nullable(),
  itens: lista(texto("Item incluído", 120, 1), "Itens incluídos", 12),
  textoBotao: texto("Texto do botão", 40, 1),
  observacao: texto("Observação", 200),
});
const garantia = z.strictObject({ ...base, tipo: z.literal("GARANTIA"), titulo: texto("Título", 120, 1), texto: texto("Texto da garantia", 600), dias: z.number().int("Dias: número inteiro.").min(0, "Dias: 0 a 365.").max(365, "Dias: 0 a 365.") });
const faq = z.strictObject({
  ...base,
  tipo: z.literal("FAQ"),
  titulo: texto("Título", 120),
  itens: lista(z.strictObject({ pergunta: texto("Pergunta", 200, 1), resposta: texto("Resposta", 1500, 1) }), "Perguntas", 20, 1),
});
const chamada = z.strictObject({ ...base, tipo: z.literal("CHAMADA"), titulo: texto("Título", 120, 1), texto: texto("Texto", 400), botao: botaoSchema });
const formulario = z.strictObject({
  ...base,
  tipo: z.literal("FORMULARIO"),
  titulo: texto("Título do formulário", 120, 1),
  texto: texto("Texto do formulário", 400),
  textoBotao: texto("Texto do botão", 40, 1),
  /** Texto do consentimento LGPD que a pessoa marca (gravado com o lead, com a data). */
  consentimento: texto("Texto do consentimento", 400, 10),
  /** Tag que o lead recebe (deste criador); nula = sem tag. */
  tagId: uuid.nullable(),
  sucesso: texto("Mensagem de sucesso", 300, 1),
});

export const blocoSchema = z.discriminatedUnion("tipo", [capa, beneficios, modulos, autor, depoimentos, preco, garantia, faq, chamada, formulario], { error: "Tipo de bloco inválido." });
export type BlocoPagina = z.infer<typeof blocoSchema>;
export type BlocoDoTipo<T extends TipoBloco> = Extract<BlocoPagina, { tipo: T }>;

export const seoSchema = z.strictObject({
  titulo: texto("Título para buscadores", 70),
  descricao: texto("Descrição para buscadores", 160),
  /** Imagem de compartilhamento (arquivo IMAGEM deste criador). */
  imagemArquivoId: uuid.nullable(),
  /** Pede aos buscadores para não indexar (`noindex`). */
  noindex: z.boolean(),
});
export type SeoPagina = z.infer<typeof seoSchema>;

export const configPaginaSchema = z
  .strictObject({ tema: z.enum(TEMAS_PAGINA, { error: "Tema inválido." }), seo: seoSchema, blocos: lista(blocoSchema, "Blocos", MAX_BLOCOS) })
  .superRefine((c, ctx) => {
    if (new Set(c.blocos.map((b) => b.id)).size !== c.blocos.length) ctx.addIssue({ code: "custom", message: "Bloco repetido na página.", path: ["blocos"] });
    if (c.blocos.filter((b) => b.tipo === "FORMULARIO").length > 1) ctx.addIssue({ code: "custom", message: "Só um formulário de captura por página.", path: ["blocos"] });
  });
export type ConfigPagina = z.infer<typeof configPaginaSchema>;

/** Ids que a action confere (deste criador) a cada gravação. */
export function referenciasDaConfig(c: ConfigPagina) {
  const imagens = new Set<string>();
  const produtos = new Set<string>();
  const ofertas = new Set<string>();
  const tags = new Set<string>();
  if (c.seo.imagemArquivoId) imagens.add(c.seo.imagemArquivoId);
  for (const b of c.blocos) {
    if (b.tipo === "CAPA" && b.midia.tipo === "IMAGEM") imagens.add(b.midia.arquivoId);
    if (b.tipo === "AUTOR" && b.imagemArquivoId) imagens.add(b.imagemArquivoId);
    if (b.tipo === "MODULOS" && b.produtoId) produtos.add(b.produtoId);
    if (b.tipo === "PRECO" && b.ofertaId) ofertas.add(b.ofertaId);
    if (b.tipo === "FORMULARIO" && b.tagId) tags.add(b.tagId);
  }
  return { imagens: [...imagens], produtos: [...produtos], ofertas: [...ofertas], tags: [...tags] };
}

/** O que impede publicar (bloco visível sem a referência obrigatória). Vazio = pode publicar. */
export function pendenciasParaPublicar(c: ConfigPagina): string[] {
  const visiveis = c.blocos.filter((b) => b.visivel);
  const faltas: string[] = [];
  if (!visiveis.length) faltas.push("mostre ao menos um bloco");
  if (visiveis.some((b) => b.tipo === "PRECO" && !b.ofertaId)) faltas.push("escolha a oferta do bloco Preço");
  if (visiveis.some((b) => b.tipo === "MODULOS" && !b.produtoId)) faltas.push("escolha o curso do bloco Módulos");
  return faltas;
}

/** Âncora do botão "Ir para o preço/formulário" (a primeira ocorrência visível recebe o id). */
export const ANCORA: Record<Exclude<AcaoBotaoPagina, "LINK">, string> = { PRECO: "preco", FORMULARIO: "formulario" };

/** Texto do criador em parágrafos (cada linha não vazia = um parágrafo). */
export const paragrafos = (t: string) =>
  t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

/** Resumo da página para a trilha ("Capa, Benefícios, Preço (oculto)"). */
export const resumoDosBlocos = (c: ConfigPagina) => c.blocos.map((b) => `${ROTULO_BLOCO[b.tipo]}${b.visivel ? "" : " (oculto)"}`).join(", ") || "sem blocos";

/** Sugestão de endereço a partir do nome ("Curso de Liderança!" → "curso-de-lideranca"). */
export const slugDoTitulo = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
