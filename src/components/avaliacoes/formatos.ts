import type { MotivoAvaliacao } from "@/lib/avaliacoes/regras";

/** Formatos e textos PUROS das telas de avaliação do aluno (servidor e cliente). */

const BRASILIA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** "12/10/2026 às 14:30" (Brasília). */
export function dataHora(d: Date): string {
  const p = Object.fromEntries(BRASILIA.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}`;
}

/** Cronômetro: "4:05", "12:00", "1:02:03". */
export function relogio(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Duração legível: "45 s", "12 min", "1 h 05 min". */
export function duracaoLegivel(segundos: number): string {
  if (segundos < 60) return `${Math.max(0, Math.round(segundos))} s`;
  const min = Math.round(segundos / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

/** Por que não dá para iniciar, por extenso (página da avaliação). */
export function explicarMotivo(motivo: MotivoAvaliacao, c: { curso: string; aulasPendentes: number; doModulo: boolean }): string {
  switch (motivo) {
    case "MATRICULA":
      return `Esta avaliação é do curso “${c.curso}”. Fale com a equipe para liberar o seu acesso.`;
    case "MODULO_BLOQUEADO":
      return "Seja aprovado na avaliação do módulo anterior para liberar esta.";
    case "AULAS_PENDENTES":
      return `Conclua ${c.aulasPendentes === 1 ? "a aula que falta" : `as ${c.aulasPendentes} aulas que faltam`} ${c.doModulo ? "do módulo" : "do curso"} para liberar.`;
    case "TENTATIVAS_ESGOTADAS":
      return "Você usou todas as tentativas. Fale com a equipe se precisar de uma nova chance.";
    default:
      return "Esta avaliação não está disponível para você agora.";
  }
}

/** "2 restantes" / "Última tentativa" / "Ilimitadas" (`null` = sem limite). */
export function textoTentativas(restantes: number | null): string {
  if (restantes === null) return "Ilimitadas";
  if (restantes === 0) return "Nenhuma restante";
  if (restantes === 1) return "Última tentativa";
  return `${restantes} restantes`;
}
