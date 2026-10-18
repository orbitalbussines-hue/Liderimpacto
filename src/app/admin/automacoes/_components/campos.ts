import type { GatilhoAutomacao } from "@/lib/db/schema/_enums";
import type { ConteudoMarketing } from "@/lib/db/schema/marketing";
import { criarAutomacaoSchema } from "@/lib/validators/marketing";
import { atrasoEmUnidade, MAX_ATRASO_MINUTOS, MINUTOS_POR, pedeCurso, pedeDias, type UnidadeAtraso } from "./comum";

/** Estado do formulário (tudo string, como o input devolve) ↔ entrada das actions. Puro. */

export interface CamposAutomacao {
  nome: string;
  gatilho: GatilhoAutomacao;
  /** "" = qualquer curso. */
  produtoId: string;
  dias: string;
  atrasoValor: string;
  atrasoUnidade: UnidadeAtraso;
  comEmail: boolean;
  assunto: string;
  previa: string;
  titulo: string;
  corpo: string;
  botaoTexto: string;
  botaoUrl: string;
  comTag: boolean;
  tagId: string;
}

export type CampoComErro = "nome" | "produtoId" | "dias" | "atraso" | "acao" | "assunto" | "previa" | "titulo" | "corpo" | "botaoTexto" | "botaoUrl" | "tagId";
export type ErrosAutomacao = Partial<Record<CampoComErro, string>>;

export const CAMPOS_VAZIOS: CamposAutomacao = {
  nome: "",
  gatilho: "CURSO_CONCLUIDO",
  produtoId: "",
  dias: "",
  atrasoValor: "0",
  atrasoUnidade: "minutos",
  comEmail: true,
  assunto: "",
  previa: "",
  titulo: "",
  corpo: "",
  botaoTexto: "",
  botaoUrl: "",
  comTag: false,
  tagId: "",
};

/** Conteúdo de um modelo (ou da automação gravada) → campos do e-mail. */
export const camposDoConteudo = (c: ConteudoMarketing) => ({
  assunto: c.assunto,
  previa: c.previa,
  titulo: c.titulo,
  corpo: c.corpo,
  botaoTexto: c.botao?.texto ?? "",
  botaoUrl: c.botao?.url ?? "",
});

export function camposDaAutomacao(a: {
  nome: string;
  gatilho: GatilhoAutomacao;
  produtoId: string | null;
  dias: number | null;
  atrasoMinutos: number;
  conteudo: ConteudoMarketing | null;
  tagId: string | null;
}): CamposAutomacao {
  const atraso = atrasoEmUnidade(a.atrasoMinutos);
  return {
    ...CAMPOS_VAZIOS,
    nome: a.nome,
    gatilho: a.gatilho,
    produtoId: a.produtoId ?? "",
    dias: a.dias === null ? "" : String(a.dias),
    atrasoValor: String(atraso.valor),
    atrasoUnidade: atraso.unidade,
    comEmail: !!a.conteudo,
    ...(a.conteudo ? camposDoConteudo(a.conteudo) : {}),
    comTag: !!a.tagId,
    tagId: a.tagId ?? "",
  };
}

/** Caminho do erro do Zod → campo da tela. */
function campoDoErro(path: readonly PropertyKey[]): CampoComErro {
  const [p0, p1, p2] = path.map(String);
  if (p0 === "conteudo" && p1 === "botao") return p2 === "url" ? "botaoUrl" : "botaoTexto";
  if (p0 === "conteudo" && p1) return p1 as CampoComErro;
  if (p0 === "conteudo") return "acao";
  if (p0 === "atrasoMinutos") return "atraso";
  return p0 as CampoComErro;
}

export type EntradaAutomacao = ReturnType<typeof criarAutomacaoSchema.parse>;

/** Valida com o MESMO schema da action. Erro = mensagem por campo. */
export function entradaDaAutomacao(c: CamposAutomacao): { ok: true; entrada: EntradaAutomacao } | { ok: false; erros: ErrosAutomacao } {
  const erros: ErrosAutomacao = {};
  const valor = Number(c.atrasoValor.trim() || "0");
  const atrasoMinutos = valor * MINUTOS_POR[c.atrasoUnidade];
  if (!Number.isInteger(valor) || valor < 0) erros.atraso = "Use um número inteiro (0 = na hora).";
  else if (atrasoMinutos > MAX_ATRASO_MINUTOS) erros.atraso = "A espera pode ser de no máximo 30 dias.";
  if (c.comTag && !c.tagId) erros.tagId = "Escolha a tag.";
  const dias = c.dias.trim();
  const bruto = {
    nome: c.nome,
    gatilho: c.gatilho,
    produtoId: pedeCurso(c.gatilho) && c.produtoId ? c.produtoId : null,
    dias: pedeDias(c.gatilho) ? (dias ? Number(dias) : null) : null,
    atrasoMinutos: erros.atraso ? 0 : atrasoMinutos,
    conteudo: c.comEmail
      ? { assunto: c.assunto, previa: c.previa, titulo: c.titulo, corpo: c.corpo, botao: c.botaoTexto.trim() || c.botaoUrl.trim() ? { texto: c.botaoTexto, url: c.botaoUrl } : null }
      : null,
    tagId: c.comTag && c.tagId ? c.tagId : null,
  };
  const v = criarAutomacaoSchema.safeParse(bruto);
  if (!v.success) for (const i of v.error.issues) erros[campoDoErro(i.path)] ??= i.message;
  // As regras do gatilho (superRefine) só rodam quando o resto passa: as duas mais comuns já saem aqui.
  if (pedeDias(c.gatilho) && !dias) erros.dias ??= "Informe em quantos dias.";
  if (!c.comEmail && !c.comTag) erros.acao = "Escolha ao menos uma ação: enviar e-mail ou aplicar tag.";
  else if (c.comTag && !c.tagId) delete erros.acao;
  if (Object.keys(erros).length || !v.success) return { ok: false, erros };
  return { ok: true, entrada: v.data };
}
