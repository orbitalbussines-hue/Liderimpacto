"use client";

import { useState, useTransition } from "react";
import { Interruptor } from "@/components/ui/interruptor";
import { acaoIncluirDocumento } from "@/lib/actions/conhecimento";

export interface InterruptorFonteProps {
  documentoId: string;
  titulo: string;
  incluir: boolean;
  versao: string;
}

/** Liga/desliga a fonte na base (otimista; volta se a action recusar). */
export function InterruptorFonte({ documentoId, titulo, incluir, versao }: InterruptorFonteProps) {
  const [ligado, setLigado] = useState(incluir);
  const [v, setV] = useState(versao);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <Interruptor
        ligado={ligado}
        disabled={pendente}
        aria-label={`Usar "${titulo}" nas respostas do assistente`}
        onAlternar={(novo) =>
          iniciar(async () => {
            setErro(null);
            setLigado(novo);
            const r = await acaoIncluirDocumento({ documentoId, versao: v, incluir: novo }).catch(() => null);
            if (r?.ok) return setV(r.dados.versao);
            setLigado(!novo);
            setErro(r?.erro ?? "Sem conexão.");
          })
        }
      />
      {erro && (
        <span role="alert" className="text-xs text-warn">
          {erro}
        </span>
      )}
    </div>
  );
}
