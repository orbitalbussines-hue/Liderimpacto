import Link from "next/link";
import { Check, ClipboardList, Lock, PlayCircle } from "lucide-react";
import { duracaoCurta } from "@/components/aluno/formatos";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { buttonVariants } from "@/components/ui/button";
import { Cartao } from "@/components/ui/cartao";
import { Selo } from "@/components/ui/selo";
import type { EstadoItemTrilha, MotivoItemTrilha } from "@/lib/trilhas/regras";
import type { TipoItemTrilha } from "@/lib/db/schema/_enums";
import { cn } from "@/lib/utils";

export interface EtapaTrilhaProps {
  numero: number;
  tipo: TipoItemTrilha;
  titulo: string;
  /** "Curso" | "Quiz · Curso X". */
  subtitulo: string;
  href: string;
  estado: EstadoItemTrilha;
  motivo: MotivoItemTrilha | null;
  textoMotivo: string | null;
  /** Curso: % das aulas; avaliação: melhor nota (ou null). */
  percentual: number | null;
  duracaoSeg: number;
  /** Última etapa: sem o traço que liga à próxima. */
  ultima?: boolean;
}

const SELO: Record<EstadoItemTrilha, { texto: string; tom: "ok" | "accent" | "neutro" | "warn" }> = {
  concluido: { texto: "Concluída", tom: "ok" },
  andamento: { texto: "Em andamento", tom: "accent" },
  disponivel: { texto: "Disponível", tom: "neutro" },
  bloqueado: { texto: "Bloqueada", tom: "neutro" },
};

const CTA: Record<Exclude<EstadoItemTrilha, "bloqueado">, string> = { concluido: "Rever", andamento: "Continuar", disponivel: "Começar" };

/** Uma etapa da página da trilha: número (dourado quando concluída), tipo, progresso, estado e o que fazer. */
export function EtapaTrilha({ numero, tipo, titulo, subtitulo, href, estado, motivo, textoMotivo, percentual, duracaoSeg, ultima }: EtapaTrilhaProps) {
  const avaliacao = tipo === "AVALIACAO";
  const detalhes = [subtitulo, !avaliacao && duracaoSeg > 0 ? duracaoCurta(duracaoSeg) : null, avaliacao && percentual !== null ? `melhor nota ${percentual}%` : null].filter(Boolean).join(" · ");
  const bloqueada = estado === "bloqueado";
  // "Matricule-se" leva à página do curso (lá aparece como liberar); "conclua a anterior" não tem para onde ir.
  const linkDoBloqueio = bloqueada && motivo === "MATRICULA" ? href : null;
  return (
    <li className="relative flex list-none gap-3.5 desk:gap-5">
      <div className="flex flex-col items-center">
        <span
          aria-hidden
          className={cn(
            "z-10 mt-5 grid size-9 shrink-0 place-items-center rounded-full border-2 text-[13px] font-extrabold",
            estado === "concluido" ? "border-accent bg-accent text-accent-ink" : estado === "andamento" ? "border-accent bg-bg text-accent" : "border-border bg-bg text-muted",
          )}
        >
          {estado === "concluido" ? <Check className="size-4" strokeWidth={3} /> : numero}
        </span>
        {!ultima && <span aria-hidden className={cn("-mb-3 w-0.5 flex-1", estado === "concluido" ? "bg-accent" : "bg-border")} />}
      </div>
      <Cartao padding={18} className={cn("mb-3 flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-3", bloqueada && "opacity-80")}>
        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-[.1em] text-muted uppercase">
            {avaliacao ? <ClipboardList className="size-3.5" aria-hidden /> : <PlayCircle className="size-3.5" aria-hidden />}
            Etapa {numero}
          </div>
          <h3 className="m-0 font-sans text-base font-bold">
            {bloqueada && !linkDoBloqueio ? (
              titulo
            ) : (
              <Link href={href} className="text-text no-underline hover:underline">
                {titulo}
              </Link>
            )}
          </h3>
          <div className="text-xs text-muted">{detalhes}</div>
          {!avaliacao && estado === "andamento" && percentual !== null && (
            <BarraProgresso valor={percentual} mostrarPercentual rotulo={`Progresso em ${titulo}`} className="mt-1.5 max-w-[320px]" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Selo tom={SELO[estado].tom}>
            <span className="sr-only">Situação: </span>
            {SELO[estado].texto}
          </Selo>
          {bloqueada ? (
            linkDoBloqueio ? (
              <Link href={linkDoBloqueio} className={buttonVariants({ variant: "contorno", size: "36" })}>
                <Lock aria-hidden />
                {textoMotivo ?? "Matricule-se"}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted">
                <Lock className="size-3.5" aria-hidden />
                {textoMotivo ?? "Indisponível"}
              </span>
            )
          ) : (
            <Link href={href} aria-label={`${CTA[estado]}: ${titulo}`} className={buttonVariants({ variant: estado === "andamento" ? "primario" : "contorno", size: "36" })}>
              {CTA[estado]}
            </Link>
          )}
        </div>
      </Cartao>
    </li>
  );
}
