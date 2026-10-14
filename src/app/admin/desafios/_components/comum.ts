import type { AbaTabela } from "@/components/admin/pagina-tabela";
import type { TomSelo } from "@/components/admin/tabela-tipos";
import type { MomentoDoDesafio } from "@/lib/gamificacao/regras";

/** Abas de Admin > Desafios (rotas próprias, como Membros > Grupos). */
export const ABAS_DESAFIOS: AbaTabela[] = [
  { rotulo: "Desafios", href: "/admin/desafios" },
  { rotulo: "Ranking", href: "/admin/desafios/ranking" },
  { rotulo: "Recompensas", href: "/admin/desafios/recompensas" },
];

export type SituacaoNaTela = MomentoDoDesafio | "RASCUNHO";

export const SELO_SITUACAO: Record<SituacaoNaTela, { texto: string; tom: TomSelo }> = {
  RASCUNHO: { texto: "Rascunho", tom: "neutro" },
  EM_BREVE: { texto: "Agendado", tom: "accent" },
  ATIVO: { texto: "Ativo", tom: "ok" },
  ENCERRADO: { texto: "Encerrado", tom: "neutro" },
};

const fuso = { timeZone: "America/Sao_Paulo" } as const;

/** "14/10 a 21/10" no calendário de Brasília. */
export function periodoCurto(inicio: Date, fim: Date): string {
  const f = (d: Date) => d.toLocaleDateString("pt-BR", { ...fuso, day: "2-digit", month: "2-digit" });
  return `${f(inicio)} a ${f(fim)}`;
}

/** "14/10/26 às 19:00" no fuso de Brasília. */
export function dataHora(d: Date): string {
  const data = d.toLocaleDateString("pt-BR", { ...fuso, day: "2-digit", month: "2-digit", year: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { ...fuso, hour: "2-digit", minute: "2-digit" });
  return `${data} às ${hora}`;
}

/**
 * `<input type="datetime-local">` no fuso de Brasília. ponytail: fuso fixo -03:00 (sem horário de
 * verão desde 2019), como a liberação da aula; se voltar, converter com Intl.
 */
export function paraCampoLocal(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() - 3 * 3_600_000).toISOString().slice(0, 16);
}
export const paraIso = (local: string): string => (local ? new Date(`${local}:00-03:00`).toISOString() : "");
