"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { acaoBaixarCertificado } from "@/lib/actions/certificados";
import type { SituacaoVersaoCertificado } from "@/lib/db/schema/_enums";

export interface BotaoBaixarCertificadoProps {
  certificadoId: string;
  /** Situação da ÚLTIMA versão do PDF (`null` = nenhuma ainda). */
  pdf: SituacaoVersaoCertificado | null;
  revogado?: boolean;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  larguraTotal?: boolean;
}

/**
 * "Baixar PDF": pede o link curto de 5 min (`acaoBaixarCertificado`, que confere o dono de novo)
 * e baixa sem sair da página. PDF pendente = "Gerando…" (desabilitado; a página usa
 * `AtualizarEnquantoGera`); revogado não baixa.
 */
export function BotaoBaixarCertificado({ certificadoId, pdf, revogado = false, variant = "primario", size = "40", larguraTotal }: BotaoBaixarCertificadoProps) {
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const gerando = !revogado && (pdf === null || pdf === "PENDENTE");

  const baixar = async () => {
    setErro(null);
    setBaixando(true);
    const r = await acaoBaixarCertificado({ certificadoId }).catch(() => null);
    setBaixando(false);
    if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
    if (!r.ok) return setErro(r.erro);
    window.location.assign(r.dados.url); // o storage responde "attachment": baixa e a página fica
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Button variant={revogado ? "contorno" : variant} size={size} larguraTotal={larguraTotal} disabled={revogado || gerando} carregando={baixando} onClick={() => void baixar()}>
        {gerando ? <LoaderCircle className="animate-spin" aria-hidden /> : !baixando && !revogado && <Download aria-hidden />}
        {revogado ? "Revogado" : gerando ? "Gerando…" : "Baixar PDF"}
      </Button>
      {erro && (
        <p role="alert" className="m-0 text-xs font-semibold text-warn">
          {erro}
        </p>
      )}
    </div>
  );
}
