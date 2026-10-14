import { SegmentosLink } from "@/components/ui/segmentos-link";
import { PERIODOS_RANKING, ROTULO_PERIODO_RANKING, type PeriodoRanking } from "@/lib/gamificacao/regras";

export interface PeriodoRankingProps {
  ativo: PeriodoRanking;
  /** Link de cada período (searchParams da página). */
  href: (periodo: PeriodoRanking) => string;
  className?: string;
}

/** Semana / Mês / Total do ranking (admin e /conquistas). */
export function PeriodoRankingLinks({ ativo, href, className }: PeriodoRankingProps) {
  return (
    <SegmentosLink
      aria-label="Período do ranking"
      className={className}
      opcoes={PERIODOS_RANKING.map((p) => ({ rotulo: ROTULO_PERIODO_RANKING[p], href: href(p), ativo: p === ativo }))}
    />
  );
}
