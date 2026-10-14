import type { ReactNode } from "react";

export interface LinhaInfoProps {
  rotulo: string;
  valor: ReactNode;
  ajuda?: ReactNode;
}

/** Linha só leitura (rótulo · valor · ajuda) de um `<dl>` das telas de Configurações. */
export function LinhaInfo({ rotulo, valor, ajuda }: LinhaInfoProps) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-3 last:border-b-0 desk:flex-row desk:items-baseline desk:gap-4">
      <dt className="text-[13px] text-muted desk:w-40 desk:shrink-0">{rotulo}</dt>
      <dd className="m-0 min-w-0 text-sm font-semibold break-words">
        {valor}
        {ajuda && <span className="mt-0.5 block text-xs font-normal text-muted">{ajuda}</span>}
      </dd>
    </div>
  );
}
