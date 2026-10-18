import { z } from "zod";
import { MODELOS_PAGINA } from "@/lib/db/schema/_enums";
import { RE_SLUG_PAGINA, configPaginaSchema } from "@/lib/paginas/config";
import { emailPessoa, idSchema, nomePessoa, versaoSchema } from "./membros";

/** Páginas, funis e leads (ADR-0022). Actions e telas usam os MESMOS schemas. */

export const slugPagina = z
  .string()
  .trim()
  .toLowerCase()
  .regex(RE_SLUG_PAGINA, "Endereço: 2 a 60 letras minúsculas, números e hífen (sem hífen nas pontas).");
export const tituloPagina = z.string().trim().min(2, "Nome da página: mínimo de 2 caracteres.").max(80, "Nome da página: máximo de 80 caracteres.");

export const criarPaginaSchema = z.strictObject({ modelo: z.enum(MODELOS_PAGINA, "Modelo inválido."), titulo: tituloPagina, slug: slugPagina });
export const salvarPaginaSchema = z.strictObject({ paginaId: idSchema, versao: versaoSchema, titulo: tituloPagina, slug: slugPagina, config: configPaginaSchema });
export const versaoPaginaSchema = z.strictObject({ paginaId: idSchema, versao: versaoSchema });
export const imagemPaginaSchema = z.strictObject({ arquivoId: idSchema });

const nomeFunil = z.string().trim().min(2, "Nome do funil: mínimo de 2 caracteres.").max(80, "Nome do funil: máximo de 80 caracteres.");
export const etapasSchema = z
  .array(z.strictObject({ paginaId: idSchema, nome: z.string().trim().min(1, "Nome da etapa: obrigatório.").max(60, "Nome da etapa: máximo de 60 caracteres.") }))
  .min(1, "Adicione ao menos uma etapa.")
  .max(10, "No máximo 10 etapas.")
  .refine((e) => new Set(e.map((x) => x.paginaId)).size === e.length, "A mesma página aparece em duas etapas.");
export const criarFunilSchema = z.strictObject({ nome: nomeFunil, etapas: etapasSchema });
export const salvarFunilSchema = z.strictObject({ funilId: idSchema, versao: versaoSchema, nome: nomeFunil, etapas: etapasSchema });
export const excluirFunilSchema = z.strictObject({ funilId: idSchema, versao: versaoSchema });

/** Período das métricas (dias até hoje). */
export const PERIODOS_METRICAS = [7, 30, 90] as const;

/** UTM da URL: só as 5 chaves; valor curto e sem caractere de controle (vai para a tela como texto). */
const valorUtm = z
  .string()
  .trim()
  .max(100)
  .regex(/^[^\p{Cc}<>]*$/u);
export const UTM_CHAVES = ["source", "medium", "campaign", "term", "content"] as const;

/** Formulário público de captura (FormData já convertido). `site` = honeypot (tem de vir vazio). */
export const capturaSchema = z.strictObject({
  pagina: idSchema,
  funil: idSchema.nullable(),
  nome: nomePessoa,
  email: emailPessoa,
  consentimento: z.literal("sim", "Marque o consentimento para continuar."),
  site: z.string().max(200),
  utm: z.strictObject({ source: valorUtm.optional(), medium: valorUtm.optional(), campaign: valorUtm.optional(), term: valorUtm.optional(), content: valorUtm.optional() }),
  /** Repasse para a próxima etapa do funil (o servidor valida de novo com os schemas da Fase 2). */
  cupom: z.string().max(40),
  afiliado: z.string().max(40),
});

export const filtrosLeadsSchema = z.strictObject({
  pagina: idSchema.optional(),
  funil: idSchema.optional(),
  busca: z.string().trim().max(254).optional(),
  pagina_n: z.coerce.number().int().min(1).max(10_000).default(1),
});
