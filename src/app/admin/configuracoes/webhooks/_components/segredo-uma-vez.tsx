"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";

export interface SegredoUmaVezProps {
  /** Segredo em claro (só no estado da tela; `null` = fechado). */
  segredo: string | null;
  nome: string;
  onFechar: () => void;
}

/**
 * Segredo do webhook MOSTRADO UMA VEZ (RN-204): nunca em URL, log ou armazenamento. ESC não fecha
 * (perderia o segredo sem querer): só "Já guardei".
 */
export function SegredoUmaVez({ segredo, nome, onFechar }: SegredoUmaVezProps) {
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState(false);
  const fechar = () => {
    setCopiado(false);
    setErro(false);
    onFechar();
  };
  const copiar = async () => {
    if (!segredo) return;
    try {
      await navigator.clipboard.writeText(segredo);
      setCopiado(true);
      setErro(false);
    } catch {
      setErro(true);
    }
  };
  return (
    <DialogoAdmin
      aberto={segredo !== null}
      onFechar={() => undefined}
      titulo="Segredo de assinatura"
      descricao={`Webhook "${nome}". Use este segredo no sistema que recebe os eventos para conferir a assinatura de cada envio.`}
      rodape={
        <Button size="42" onClick={fechar}>
          Já guardei o segredo
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Campo
          rotulo="Segredo"
          value={segredo ?? ""}
          readOnly
          tamanho="42"
          className="font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
          erro={erro ? "Não foi possível copiar. Selecione o texto e copie manualmente." : undefined}
        />
        <Button type="button" variant={copiado ? "secundario" : "contorno"} size="40" onClick={copiar} className="self-start">
          {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copiado ? "Copiado" : "Copiar segredo"}
        </Button>
        <Aviso>Ele não será mostrado de novo. Se perder, use “Trocar segredo”: o atual deixa de valer na hora.</Aviso>
      </div>
    </DialogoAdmin>
  );
}
