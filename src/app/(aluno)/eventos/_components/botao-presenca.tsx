"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { acaoCancelarPresenca, acaoConfirmarPresenca } from "@/lib/actions/eventos";

export interface BotaoPresencaProps {
  eventoId: string;
  inscrito: boolean;
  /** Secundário quando já há "Entrar no encontro" ao lado (um só botão cheio por cartão). */
  secundario?: boolean;
}

/** "Confirmar presença" / "Cancelar presença" (a PRÓPRIA; o servidor confere público e prazo). */
export function BotaoPresenca({ eventoId, inscrito, secundario = false }: BotaoPresencaProps) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const alternar = () =>
    iniciar(async () => {
      setErro(null);
      const r = await (inscrito ? acaoCancelarPresenca : acaoConfirmarPresenca)({ eventoId }).catch(() => null);
      if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
      if (!r.ok) return setErro(r.erro);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-2">
      {inscrito ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ok">
            <Check aria-hidden className="size-4" />
            Presença confirmada
          </span>
          <Button variant="link" size="40" onClick={alternar} carregando={pendente} className="min-h-11 px-0 text-muted">
            Cancelar presença
          </Button>
        </div>
      ) : (
        <Button size="46" pilula variant={secundario ? "contorno" : "primario"} onClick={alternar} carregando={pendente} className="w-full">
          Confirmar presença
        </Button>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </div>
  );
}
