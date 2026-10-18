import type { AbaTabela } from "@/components/admin/pagina-tabela";
import type { TomSelo } from "@/components/admin/tabela-tipos";
import type { SituacaoPagina } from "@/lib/db/schema/_enums";

/** Abas de Páginas (domínio próprio fica para depois, ADR-0022). */
export const ABAS_PAGINAS: AbaTabela[] = [
  { rotulo: "Páginas", href: "/admin/paginas" },
  { rotulo: "Leads", href: "/admin/paginas/leads" },
];

/** Situação na lista: publicada com rascunho diferente = "com alterações" (ainda não publicadas). */
export function situacaoDaPagina(s: SituacaoPagina, alterada: boolean, publicacoes: number): { texto: string; tom: TomSelo } {
  if (s === "PUBLICADA") return alterada ? { texto: "Publicada · com alterações", tom: "accent" } : { texto: "Publicada", tom: "ok" };
  return publicacoes > 0 ? { texto: "Fora do ar", tom: "warn" } : { texto: "Rascunho", tom: "neutro" };
}
