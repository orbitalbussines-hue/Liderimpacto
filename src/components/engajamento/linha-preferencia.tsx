import type { ReactNode } from "react";

export interface LinhaPreferenciaProps {
  titulo: string;
  descricao?: string;
  /** Interruptor ou botão à direita. */
  controle: ReactNode;
}

/** Linha de preferência: texto à esquerda, controle à direita, separador (some na última). */
export function LinhaPreferencia({ titulo, descricao, controle }: LinhaPreferenciaProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div>
        <div className="text-sm font-semibold">{titulo}</div>
        {descricao && <div className="text-xs text-muted">{descricao}</div>}
      </div>
      {controle}
    </div>
  );
}
