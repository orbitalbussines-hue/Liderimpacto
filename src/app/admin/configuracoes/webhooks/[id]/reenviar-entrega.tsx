"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acaoReenviarEntrega } from "@/lib/actions/webhooks";

/** "Reenviar" de uma entrega que FALHOU (volta para a fila com as tentativas zeradas). */
export function ReenviarEntrega({ entregaId, versao, evento }: { entregaId: string; versao: string; evento: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const reenviar = () =>
    iniciar(async () => {
      const r = await acaoReenviarEntrega({ entregaId, versao }).catch(() => null);
      if (!r) return setErro("Sem conexão. Tente de novo.");
      if (!r.ok) return setErro(r.erro);
      setErro(null);
      router.refresh();
    });
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="contorno" size="36" carregando={pendente} onClick={reenviar} aria-label={`Reenviar a entrega de ${evento}`}>
        <RotateCcw className="size-3.5" aria-hidden />
        Reenviar
      </Button>
      {erro && (
        <span role="alert" className="text-xs text-warn">
          {erro}
        </span>
      )}
    </div>
  );
}
