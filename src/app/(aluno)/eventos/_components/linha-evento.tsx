import Link from "next/link";
import type { ReactNode } from "react";
import { BlocoData } from "@/components/engajamento/bloco-data";
import { Cartao } from "@/components/ui/cartao";
import { ROTA_EVENTOS } from "@/lib/eventos/regras";
import { diaEMes, duracaoTexto, quandoPorExtenso } from "@/lib/eventos/tela";

export interface LinhaEventoProps {
  id: string;
  titulo: string;
  inicioEm: Date;
  duracaoMin: number;
  /** Cancelado ou passado: data em neutro. */
  apagado?: boolean;
  /** Texto curto à direita do título ("Cancelado", "Presença confirmada"). */
  situacao?: ReactNode;
  /** Ação à direita (ex.: "Assistir gravação"). */
  acao?: ReactNode;
}

/** Encontro numa lista: data em bloco, título (link para o detalhe) e quando. */
export function LinhaEvento({ id, titulo, inicioEm, duracaoMin, apagado, situacao, acao }: LinhaEventoProps) {
  const { dia, mes } = diaEMes(inicioEm);
  return (
    <Cartao como="article" padding={16} className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <Link href={`${ROTA_EVENTOS}/${id}`} className="group flex min-w-0 flex-1 basis-[240px] items-center gap-3.5">
        <BlocoData dia={dia} mes={mes} apagado={apagado} />
        <div className="min-w-0">
          <h3 className="m-0 font-sans text-[15px] font-bold tracking-normal group-hover:underline">{titulo}</h3>
          <p className="m-0 mt-0.5 text-[13px] text-muted">
            {quandoPorExtenso(inicioEm)} · {duracaoTexto(duracaoMin)}
          </p>
          {situacao && <p className="m-0 mt-1 text-xs font-semibold text-muted">{situacao}</p>}
        </div>
      </Link>
      {acao}
    </Cartao>
  );
}
