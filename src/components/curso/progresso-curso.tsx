import Link from "next/link";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { buttonVariants } from "@/components/ui/button";
import { Cartao } from "@/components/ui/cartao";

export interface ProgressoCursoProps {
  aulasConcluidas: number;
  totalAulas: number;
  href: string;
  /** Ex.: "Continuar · Aula 3.2". */
  textoBotao: string;
}

/** Cartão "Seu progresso" da página do curso, com o botão de continuar. */
export function ProgressoCurso({ aulasConcluidas, totalAulas, href, textoBotao }: ProgressoCursoProps) {
  const pct = totalAulas > 0 ? (aulasConcluidas / totalAulas) * 100 : 0;
  return (
    <Cartao raio={14} padding={18} className="flex flex-wrap items-center gap-[18px] py-4">
      <div className="flex min-w-[200px] flex-1 flex-col gap-2">
        <div className="flex justify-between text-[13px]">
          <span className="font-semibold">Seu progresso</span>
          <span className="text-muted">
            {aulasConcluidas} de {totalAulas} aulas
          </span>
        </div>
        <BarraProgresso valor={pct} espessura={6} rotulo="Progresso do curso" className="flex-none" />
      </div>
      <Link href={href} className={buttonVariants({ size: "42", className: "h-11" })}>
        {textoBotao}
      </Link>
    </Cartao>
  );
}
