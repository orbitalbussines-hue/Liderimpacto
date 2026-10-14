import Link from "next/link";
import { Check, Clock3, Lock, Play } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { IconeQuadrado } from "@/components/ui/icone-quadrado";
import { Selo } from "@/components/ui/selo";
import { LinhaCartao } from "./linha-cartao";

export type EstadoAvaliacao = "concluida" | "andamento" | "disponivel" | "bloqueada";

export interface LinhaAvaliacaoProps {
  titulo: string;
  curso: string;
  /** "12 questões · 15 min". */
  meta: string;
  estado: EstadoAvaliacao;
  /** Nota em % (estado concluída). */
  nota?: number;
  href?: string;
  /** Texto do botão desabilitado (padrão "Bloqueada"). */
  rotuloBloqueada?: string;
  /** Texto do selo já pronto ("Disponível · melhor nota 40%"). Padrão: o do estado. */
  status?: string;
  /** Texto do botão ("Tentar de novo"). `null` = botão desabilitado com `rotuloBloqueada`. Padrão: o do estado. */
  cta?: string | null;
}

const VISUAL = {
  concluida: { tom: "ok", status: "Concluída", icone: Check, cta: "Ver resultado" },
  andamento: { tom: "accent", status: "Em andamento", icone: Clock3, cta: "Continuar" },
  disponivel: { tom: "accent", status: "Disponível", icone: Play, cta: "Iniciar" },
  bloqueada: { tom: "neutro", status: "Bloqueada", icone: Lock, cta: null },
} as const;

/** Linha da tela Avaliações (tela 6). Usa LinhaCartao. */
export function LinhaAvaliacao({ titulo, curso, meta, estado, nota, href = "#", rotuloBloqueada, status, cta }: LinhaAvaliacaoProps) {
  const visual = VISUAL[estado];
  const Icone = visual.icone;
  const textoStatus = status ?? (estado === "concluida" && nota !== undefined ? `${visual.status} · ${nota}%` : visual.status);
  const textoCta = cta === undefined ? visual.cta : cta;
  const destaque = estado === "disponivel" || estado === "andamento";
  return (
    <LinhaCartao
      icone={
        <IconeQuadrado tamanho={44} tom={visual.tom}>
          <Icone />
        </IconeQuadrado>
      }
      titulo={titulo}
      meta={`${curso} · ${meta}`}
      status={<Selo tom={visual.tom}>{textoStatus}</Selo>}
      acao={
        textoCta === null ? (
          <Button variant="contorno" disabled>
            {rotuloBloqueada ?? "Bloqueada"}
          </Button>
        ) : (
          <Link href={href} className={buttonVariants({ variant: destaque ? "primario" : "contorno" })}>
            {textoCta}
          </Link>
        )
      }
    />
  );
}
