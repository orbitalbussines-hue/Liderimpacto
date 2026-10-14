import { ControleSegmentado, type ControleSegmentadoProps } from "@/components/ui/controle-segmentado";

export const PERIODOS = [
  { valor: "7d", rotulo: "7 dias" },
  { valor: "30d", rotulo: "30 dias" },
  { valor: "90d", rotulo: "90 dias" },
] as const;

export type Periodo = (typeof PERIODOS)[number]["valor"];

type Props = Omit<ControleSegmentadoProps<Periodo>, "opcoes" | "aria-label">;

/** Período do dashboard (7 / 30 / 90 dias). Padrão: 30 dias. */
export function SeletorPeriodo({ valorInicial = "30d", ...props }: Props) {
  return <ControleSegmentado opcoes={PERIODOS} valorInicial={valorInicial} aria-label="Período" {...props} />;
}
