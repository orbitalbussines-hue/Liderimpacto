import type { PerguntaSugerida } from "@/lib/db/schema";

/** Partes aplicáveis (as mesmas de `acaoAplicarSugestao`). */
export type Parte = "DESCRICAO" | "CAPITULOS" | "PERGUNTAS";

/** Aula escolhida, já serializada pelo servidor. */
export interface AulaTela {
  id: string;
  titulo: string;
  produto: string;
  /** Editor da aula. */
  href: string;
  /** "pt-BR · en" ou null (sem legenda: a IA não tem o que ler). */
  legendas: string | null;
  /** `updated_at` ISO: trava da aula ao aplicar descrição/capítulos. */
  versao: string;
  temDescricao: boolean;
  capitulosAtuais: number;
}

export interface SugestaoTela {
  id: string;
  versao: string;
  criadaEm: string;
  custo: string;
  descricao: string;
  capitulos: { tempo: string; titulo: string }[];
  perguntas: PerguntaSugerida[];
  /** Quando cada parte foi aplicada ("17/10/26 · 14:32") ou null. */
  aplicada: Record<Parte, string | null>;
}
