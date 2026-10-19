import { z } from "zod";
import { GATILHO_LEAD, GATILHOS_AUTOMACAO, GATILHOS_COM_CURSO, GATILHOS_COM_DIAS, SITUACOES_AUTOMACAO, SITUACOES_CAMPANHA, SITUACOES_ENVIO } from "@/lib/db/schema/_enums";
import { urlSegura } from "@/lib/email/modelo";
import { extrairUrls } from "@/lib/marketing/regras";
import { idSchema, versaoSchema } from "./membros";

/**
 * Campanhas, modelos, automações e reenvio do primeiro acesso (ADR-0020). Mesmos schemas na action e
 * na tela. O conteúdo é TEXTO: nada de HTML (o modelo escapa tudo); links só https.
 */

const SEM_CONTROLE = /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/;
const linha = (min: number, max: number, rotulo: string) =>
  z
    .string()
    .trim()
    .min(min, min ? `Informe ${rotulo}.` : undefined)
    .max(max, `${rotulo[0].toUpperCase()}${rotulo.slice(1)} muito longo (máximo de ${max}).`)
    .regex(/^[^\r\n]*$/, `${rotulo[0].toUpperCase()}${rotulo.slice(1)} em uma linha só.`)
    .regex(SEM_CONTROLE, "Caracteres inválidos.");

const urlHttps = (rotulo: string) =>
  z
    .string()
    .trim()
    .max(1000, "Link muito longo (máximo de 1000).")
    .superRefine((u, ctx) => {
      try {
        urlSegura(u);
      } catch {
        ctx.addIssue({ code: "custom", message: `${rotulo}: use um endereço https:// completo.` });
      }
    });

export const MAX_LINKS_CORPO = 20;

export const conteudoSchema = z.strictObject({
  assunto: linha(1, 150, "o assunto"),
  previa: linha(0, 150, "a prévia").default(""),
  titulo: linha(1, 120, "o título"),
  corpo: z
    .string()
    .trim()
    .min(1, "Escreva o texto do e-mail.")
    .max(10_000, "Texto muito longo (máximo de 10.000).")
    .regex(SEM_CONTROLE, "Caracteres inválidos.")
    .superRefine((corpo, ctx) => {
      const urls = extrairUrls(corpo);
      if (urls.length > MAX_LINKS_CORPO) ctx.addIssue({ code: "custom", message: `No máximo ${MAX_LINKS_CORPO} links no texto.` });
      for (const u of urls) {
        try {
          urlSegura(u);
          if (u.length > 1000) throw new Error();
        } catch {
          ctx.addIssue({ code: "custom", message: `Link inválido no texto: ${u.slice(0, 60)} (use https://).` });
          return;
        }
      }
    }),
  botao: z.strictObject({ texto: linha(1, 40, "o texto do botão"), url: urlHttps("Link do botão") }).nullable().default(null),
});

const ids = (rotulo: string) => z.array(idSchema).max(50, `No máximo 50 ${rotulo}.`).default([]);
const camposPublicoMembros = {
  grupoIds: ids("grupos"),
  tagIds: ids("tags"),
  produtoIds: ids("cursos"),
  nuncaAcessou: z.boolean().default(false),
};
/** Só membros (reenvio do primeiro acesso: lead não tem conta). */
export const publicoMembrosSchema = z.strictObject(camposPublicoMembros);
/** Segmento de leads (ADR-0023): listas vazias = todos os leads. */
export const publicoLeadsSchema = z.strictObject({ paginaIds: ids("páginas"), funilIds: ids("funis"), tagIds: ids("tags") });
/** Campanha: membros e/ou leads. Campanha antiga (sem os campos) = só membros. */
export const publicoSchema = z
  .strictObject({ ...camposPublicoMembros, membros: z.boolean().default(true), leads: publicoLeadsSchema.nullable().default(null) })
  .refine((p) => p.membros || p.leads !== null, "Escolha quem recebe: membros, leads ou os dois.");

const nome = z.string().trim().min(2, "Informe um nome (mínimo de 2).").max(80, "Nome muito longo (máximo de 80).").regex(/^[^<>\r\n]+$/, "Nome com caracteres inválidos.");

export const criarModeloSchema = z.strictObject({ nome, conteudo: conteudoSchema });
export const salvarModeloSchema = z.strictObject({ modeloId: idSchema, versao: versaoSchema, nome, conteudo: conteudoSchema });
export const excluirModeloSchema = z.strictObject({ modeloId: idSchema, versao: versaoSchema });

export const criarCampanhaSchema = z.strictObject({ nome, conteudo: conteudoSchema, publico: publicoSchema });
export const salvarCampanhaSchema = z.strictObject({ campanhaId: idSchema, versao: versaoSchema, nome, conteudo: conteudoSchema, publico: publicoSchema });
export const campanhaVersaoSchema = z.strictObject({ campanhaId: idSchema, versao: versaoSchema });
/** `quando` nulo = enviar agora. */
export const agendarCampanhaSchema = z.strictObject({
  campanhaId: idSchema,
  versao: versaoSchema,
  quando: z.iso.datetime({ offset: true, message: "Data e hora inválidas." }).transform((v) => new Date(v)).nullable(),
});
export const contarPublicoSchema = z.strictObject({ publico: publicoSchema });
export const reenvioSchema = z.strictObject({ publico: publicoMembrosSchema });
export const envioTesteSchema = z.strictObject({ conteudo: conteudoSchema });

const camposAutomacao = {
  nome,
  produtoId: idSchema.nullable().default(null),
  dias: z.number().int("Dias inteiros.").min(1, "Mínimo de 1 dia.").max(365, "Máximo de 365 dias.").nullable().default(null),
  atrasoMinutos: z.number().int().min(0, "Atraso inválido.").max(43_200, "Atraso de no máximo 30 dias.").default(0),
  conteudo: conteudoSchema.nullable().default(null),
  tagId: idSchema.nullable().default(null),
  /** Só no gatilho de lead (ADR-0023). */
  paginaId: idSchema.nullable().default(null),
  funilId: idSchema.nullable().default(null),
};

type Regras = { gatilho: (typeof GATILHOS_AUTOMACAO)[number]; produtoId: string | null; dias: number | null; conteudo: unknown; tagId: string | null; paginaId: string | null; funilId: string | null };
function regrasDoGatilho(a: Regras, ctx: z.RefinementCtx) {
  const comDias = (GATILHOS_COM_DIAS as readonly string[]).includes(a.gatilho);
  if (comDias && a.dias === null) ctx.addIssue({ code: "custom", path: ["dias"], message: "Informe em quantos dias." });
  if (!comDias && a.dias !== null) ctx.addIssue({ code: "custom", path: ["dias"], message: "Dias só valem para inatividade e “nunca acessou”." });
  if (a.produtoId && !(GATILHOS_COM_CURSO as readonly string[]).includes(a.gatilho)) ctx.addIssue({ code: "custom", path: ["produtoId"], message: "Este gatilho não filtra por curso." });
  if ((a.paginaId || a.funilId) && a.gatilho !== GATILHO_LEAD) ctx.addIssue({ code: "custom", path: ["paginaId"], message: "Página e funil só valem para “cadastro numa página”." });
  if (!a.conteudo && !a.tagId) ctx.addIssue({ code: "custom", path: ["conteudo"], message: "Escolha ao menos uma ação: enviar e-mail ou aplicar tag." });
}

export const criarAutomacaoSchema = z.strictObject({ gatilho: z.enum(GATILHOS_AUTOMACAO), ...camposAutomacao }).superRefine(regrasDoGatilho);
/** O gatilho vem do banco na edição; a tela manda o mesmo para a validação. */
export const salvarAutomacaoSchema = z.strictObject({ automacaoId: idSchema, versao: versaoSchema, gatilho: z.enum(GATILHOS_AUTOMACAO), ...camposAutomacao }).superRefine(regrasDoGatilho);
export const situacaoAutomacaoSchema = z.strictObject({ automacaoId: idSchema, versao: versaoSchema, situacao: z.enum(SITUACOES_AUTOMACAO) });
export const automacaoVersaoSchema = z.strictObject({ automacaoId: idSchema, versao: versaoSchema });

/** Filtros das leituras (a tela valida os parâmetros da URL com eles). */
export const filtrosCampanhasSchema = z.strictObject({ situacao: z.enum(SITUACOES_CAMPANHA).optional() });
export const filtrosDestinatariosSchema = z.strictObject({
  situacao: z.enum(SITUACOES_ENVIO).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(50),
});
