"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";

export interface LinkDeAcessoProps {
  url: string;
  /** ISO da validade. */
  expiraEm: string;
  rotulo?: string;
}

export const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Link de primeiro acesso/redefinição MOSTRADO UMA VEZ (RN-102): só fica no estado da tela,
 * nunca em URL, log ou armazenamento. Campo só leitura + Copiar + validade.
 */
export function LinkDeAcesso({ url, expiraEm, rotulo = "Link de acesso" }: LinkDeAcessoProps) {
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setErro(false);
    } catch {
      setErro(true);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <Campo
        rotulo={rotulo}
        value={url}
        readOnly
        tamanho="42"
        onFocus={(e) => e.currentTarget.select()}
        ajuda={`Válido até ${dataHora(expiraEm)} · uso único. Envie por um canal privado; ele não aparece de novo.`}
        erro={erro ? "Não foi possível copiar. Selecione o texto e copie manualmente." : undefined}
      />
      <Button type="button" variant={copiado ? "secundario" : "primario"} size="40" onClick={copiar} className="self-start">
        {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copiado ? "Copiado" : "Copiar link"}
      </Button>
    </div>
  );
}
