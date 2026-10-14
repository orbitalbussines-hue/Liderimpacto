"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acaoEncerrarOutrasSessoes } from "@/lib/actions/seguranca";

export function EncerrarOutrasSessoes() {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="perigo"
        size="40"
        className="self-start"
        carregando={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await acaoEncerrarOutrasSessoes();
            setErro(r.ok ? null : r.erro);
          })
        }
      >
        Encerrar as outras sessões
      </Button>
      {erro && (
        <p role="alert" className="m-0 text-sm text-warn">
          {erro}
        </p>
      )}
    </div>
  );
}
