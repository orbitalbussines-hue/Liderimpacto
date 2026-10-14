import { z } from "zod";
import { PUBLICOS_EVENTO } from "@/lib/db/schema/_enums";
import { linkDeEventoValido } from "@/lib/eventos/regras";
import { idSchema, versaoSchema } from "./membros";

/**
 * Validadores dos eventos ao vivo (RN-142). Fonte única: o formulário (via `camposDoFormulario`) e as
 * actions usam os MESMOS. Toda entrada de action é `strictObject`.
 */

export { idSchema, versaoSchema };

/** Valor do `<input type="datetime-local">`: "AAAA-MM-DDTHH:MM" (horário de Brasília). */
const RE_DATA_HORA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * "2026-10-21T19:30" (Brasília) → instante. Brasília é UTC−3 fixo (sem horário de verão desde 2019,
 * como `fimDoDiaEmBrasilia`). Data impossível (31/02, 25h) = null.
 */
export function instanteDeBrasilia(texto: string): Date | null {
  const m = RE_DATA_HORA.exec(texto.trim());
  if (!m) return null;
  const [ano, mes, dia, hora, min] = m.slice(1).map(Number);
  if (ano < 2000 || ano > 2200 || hora > 23 || min > 59) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia, hora + 3, min));
  const local = new Date(d.getTime() - 3 * 3_600_000);
  return local.getUTCMonth() === mes - 1 && local.getUTCDate() === dia ? d : null;
}

/** Instante → valor do `<input type="datetime-local">` em Brasília (inverso de `instanteDeBrasilia`). */
export const campoDeBrasilia = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 16);

const RE_SEM_TAG = /^[^<>]*$/;

export const camposEventoSchema = z
  .strictObject({
    titulo: z.string().trim().min(3, "Título: mínimo de 3 caracteres.").max(120, "Título: máximo de 120 caracteres.").regex(RE_SEM_TAG, "Título com caracteres inválidos (< >)."),
    /** Texto puro: a tela escapa (nunca HTML). */
    descricao: z.string().trim().max(2000, "Descrição: máximo de 2.000 caracteres."),
    inicio: z.string().transform((v, ctx) => {
      const d = instanteDeBrasilia(v);
      if (!d) {
        ctx.addIssue({ code: "custom", message: "Informe a data e a hora de início." });
        return z.NEVER;
      }
      return d;
    }),
    duracaoMin: z.int("Duração inválida.").min(5, "Duração entre 5 e 720 minutos.").max(720, "Duração entre 5 e 720 minutos."),
    /** Vazio = sem link (só rascunho; publicar exige). */
    link: z
      .string()
      .trim()
      .transform((v) => v || null)
      .refine((v) => v === null || linkDeEventoValido(v), "Link inválido: use o endereço https da sala (Zoom, Meet, YouTube...)."),
    publico: z.enum(PUBLICOS_EVENTO, "Público inválido."),
    produtoId: idSchema.nullable(),
    grupoIds: z.array(idSchema).max(50, "Grupos demais.").refine((l) => new Set(l).size === l.length, "Grupo repetido."),
    gravacaoAulaId: idSchema.nullable(),
  })
  .superRefine((c, ctx) => {
    if (c.publico === "PRODUTO" && !c.produtoId) ctx.addIssue({ code: "custom", path: ["produtoId"], message: "Escolha o curso do público." });
    if (c.publico === "GRUPOS" && c.grupoIds.length === 0) ctx.addIssue({ code: "custom", path: ["grupoIds"], message: "Escolha ao menos um grupo." });
  })
  // Só guarda o que vale para o público escolhido.
  .transform((c) => ({ ...c, produtoId: c.publico === "PRODUTO" ? c.produtoId : null, grupoIds: c.publico === "GRUPOS" ? c.grupoIds : [] }));

export type CamposEvento = z.output<typeof camposEventoSchema>;

export const criarEventoSchema = camposEventoSchema;
export const salvarEventoSchema = z.strictObject({ eventoId: idSchema, versao: versaoSchema, campos: camposEventoSchema });
/** Publicar, cancelar e excluir (rascunho): id + versão da tela. */
export const eventoComVersaoSchema = z.strictObject({ eventoId: idSchema, versao: versaoSchema });
/** Presença do aluno: só o id (a pessoa vem da sessão). */
export const presencaSchema = z.strictObject({ eventoId: idSchema });

const texto = (f: FormData, k: string) => String(f.get(k) ?? "");
const idOuNulo = (f: FormData, k: string) => texto(f, k) || null;

/**
 * Leitura do formulário do evento (tela) → entrada da action, campo a campo. Não valida: quem
 * valida é o `camposEventoSchema` na action (a tela não é fronteira).
 */
export function camposDoFormulario(f: FormData) {
  return {
    titulo: texto(f, "titulo"),
    descricao: texto(f, "descricao"),
    inicio: texto(f, "inicio"),
    duracaoMin: Number(texto(f, "duracaoMin")),
    link: texto(f, "link"),
    publico: texto(f, "publico"),
    produtoId: idOuNulo(f, "produtoId"),
    grupoIds: f.getAll("grupoIds").map(String),
    gravacaoAulaId: idOuNulo(f, "gravacaoAulaId"),
  };
}
