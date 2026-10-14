/** Formatos de exibição da área do aluno (puros: servidor e cliente). */

/** "8 min", "1h 40", "2h" — duração em segundos (nulo/0 = "—"). */
export function duracaoCurta(segundos: number | null | undefined): string {
  if (!segundos || segundos < 1) return "—";
  const minutos = Math.max(1, Math.round(segundos / 60));
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h}h ${String(m).padStart(2, "0")}` : `${h}h`;
}

/** "dd/mm" no calendário de Brasília. */
export function diaMes(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(data);
}

/** "mai/2026" no calendário de Brasília. */
export function mesAno(data: Date): string {
  const p = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "America/Sao_Paulo" }).formatToParts(data);
  const mes = (p.find((x) => x.type === "month")?.value ?? "").replace(".", "");
  return `${mes}/${p.find((x) => x.type === "year")?.value ?? ""}`;
}

/** Primeiro nome ("Ana Demo" -> "Ana"). */
export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

export type MotivoBloqueioAula = "INDISPONIVEL" | "MATRICULA" | "LIBERACAO" | "PRE_REQUISITO";

/** Texto curto do cadeado da aula (página do curso e playlist). */
export function textoDoBloqueio(a: { motivoBloqueio: MotivoBloqueioAula | null; liberaEm: Date | null; preRequisito: { numero: string } | null }): string | null {
  switch (a.motivoBloqueio) {
    case null:
      return null;
    case "LIBERACAO":
      return a.liberaEm ? `Libera em ${diaMes(a.liberaEm)}` : "Ainda não liberada";
    case "PRE_REQUISITO":
      return a.preRequisito ? `Conclua a aula ${a.preRequisito.numero}` : "Conclua a aula anterior";
    case "MATRICULA":
      return "Matricule-se";
    default:
      return "Indisponível";
  }
}
