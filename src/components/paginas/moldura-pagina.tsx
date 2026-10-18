import type { ReactNode } from "react";
import { EstiloMarca } from "@/components/marca/estilo-marca";
import type { TemaPagina } from "@/lib/paginas/config";

/**
 * Casca da página pública e da prévia: tema escolhido NA PÁGINA (claro/escuro, independente do tema de
 * quem visita) e a cor da marca da área (`data-area="aluno"` é o escopo do EstiloMarca).
 */
export function MolduraPagina({ tema, criador, children }: { tema: TemaPagina; criador: { nome: string; cor_marca: string | null }; children: ReactNode }) {
  const t = tema === "CLARO" ? "light" : "dark";
  return (
    <div data-area="aluno" data-theme={t} style={{ colorScheme: t }} className="min-h-dvh bg-bg text-text antialiased">
      <EstiloMarca cor={criador.cor_marca} />
      <header className="mx-auto flex h-16 w-full max-w-[1120px] items-center px-5 md:px-8">
        <span className="font-serif text-[19px] font-semibold tracking-[-0.01em]">{criador.nome}</span>
      </header>
      <main>{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-2 px-5 py-8 text-[13px] text-muted md:px-8">
          <span>
            © {new Date().getFullYear()} {criador.nome}
          </span>
        </div>
      </footer>
    </div>
  );
}
