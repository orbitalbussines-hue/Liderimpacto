import type { ReactNode } from "react";

/** Tipos do molde PaginaTabela: colunas e células tipadas, reutilizáveis em toda tela de lista. */

export type TomSelo = "ok" | "warn" | "accent" | "neutro";

export type Celula =
  | { tipo: "texto"; texto: string; sub?: string; caixaAlta?: boolean }
  | { tipo: "membro"; nome: string; email: string; src?: string | null }
  | { tipo: "capa"; alt: string; src?: string | null }
  | { tipo: "selo"; texto: string; tom?: TomSelo }
  | { tipo: "etiqueta"; texto: string }
  | { tipo: "barra"; valor: number; rotulo?: string }
  | { tipo: "numeroDestaque"; texto: string }
  | { tipo: "data"; texto: string }
  | { tipo: "acoes"; rotulo: string }
  /** Conteúdo pronto (menu de ações, selos combinados) montado com peças do design system. */
  | { tipo: "no"; conteudo: ReactNode };

export interface Coluna {
  titulo: string;
  /** Largura em px. Sem valor = coluna flexível (mín. 220px). */
  largura?: number;
  /** Números (dinheiro, contagens): cabeçalho e células à direita, com `tabular-nums`. */
  alinhar?: "direita";
}

export type Linha = readonly Celula[];

/** Tom do Selo a partir do texto do status, para telas que só têm a string. */
export function tomDoStatus(texto: string): TomSelo {
  if (/^(publicad|ativ|aprovad|dispon|enviad|respondid)/i.test(texto)) return "ok";
  if (/^(n[ãa]o listad|inativ|cancelad|erro)/i.test(texto)) return "warn";
  if (/^(agendad|em andamento)/i.test(texto)) return "accent";
  return "neutro";
}
