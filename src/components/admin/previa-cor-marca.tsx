import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { gerarPaleta, type Tema } from "@/lib/marca/paleta";
import { PreviaMarca } from "./previa-marca";

/** Tokens do tema como CSS vars no próprio painel (vence o tema da página; valores gerados por gerarPaleta). */
function variaveis(cor: string, tema: Tema): CSSProperties {
  const p = gerarPaleta(cor);
  return { ...p[tema], "--marca-fixo": p.dark["--accent"], "--marca-fixo-ink": p.dark["--accent-ink"] } as CSSProperties;
}

export interface PreviaCorMarcaProps {
  /** Hex válido. */
  cor: string;
  /** `lado` = temas lado a lado em telas largas (Aparência); `pilha` = um embaixo do outro (coluna lateral). */
  disposicao?: "lado" | "pilha";
}

/** Prévia da cor da marca nos dois temas, com os componentes reais da área do aluno. */
export function PreviaCorMarca({ cor, disposicao = "lado" }: PreviaCorMarcaProps) {
  return (
    <div className={cn("grid min-w-0 gap-4", disposicao === "lado" && "xl:grid-cols-2")}>
      {(["dark", "light"] as const).map((tema) => (
        <section
          key={tema}
          data-theme={tema}
          style={variaveis(cor, tema)}
          aria-label={`Prévia no tema ${tema === "dark" ? "escuro" : "claro"}`}
          className="min-w-0 rounded-2xl border border-border bg-bg p-4 text-text"
        >
          <p className="m-0 mb-3 text-xs font-bold tracking-[.08em] text-muted uppercase">Tema {tema === "dark" ? "escuro" : "claro"}</p>
          <PreviaMarca />
        </section>
      ))}
    </div>
  );
}
