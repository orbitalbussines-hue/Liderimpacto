import Link from "next/link";
import { Check, Lock, Play } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { IconeQuadrado } from "@/components/ui/icone-quadrado";
import { Selo } from "@/components/ui/selo";
import { LinhaCartao } from "./linha-cartao";

export type EstadoAvaliacao = "concluida" | "disponivel" | "bloqueada";

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
}

const VISUAL = {
  concluida: { tom: "ok", status: "Concluída", icone: Check },
  disponivel: { tom: "accent", status: "Disponível", icone: Play },
  bloqueada: { tom: "neutro", status: "Bloqueada", icone: Lock },
} as const;

/** Linha da tela Avaliações (tela 6). Usa LinhaCartao. */
export function LinhaAvaliacao({ titulo, curso, meta, estado, nota, href = "#", rotuloBloqueada }: LinhaAvaliacaoProps) {
  const { tom, status, icone: Icone } = VISUAL[estado];
  const textoStatus = estado === "concluida" && nota !== undefined ? `${status} · ${nota}%` : status;
  return (
    <LinhaCartao
      icone={
        <IconeQuadrado tamanho={44} tom={tom}>
          <Icone />
        </IconeQuadrado>
      }
      titulo={titulo}
      meta={`${curso} · ${meta}`}
      status={<Selo tom={tom}>{textoStatus}</Selo>}
      acao={
        estado === "bloqueada" ? (
          <Button variant="contorno" disabled>
            {rotuloBloqueada ?? "Bloqueada"}
          </Button>
        ) : (
          <Link href={href} className={buttonVariants({ variant: estado === "disponivel" ? "primario" : "contorno" })}>
            {estado === "disponivel" ? "Iniciar" : "Ver resultado"}
          </Link>
        )
      }
    />
  );
}
