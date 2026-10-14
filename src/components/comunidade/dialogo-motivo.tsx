"use client";

import { useState, type ReactNode } from "react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { AreaTexto } from "@/components/ui/area-texto";
import { Button } from "@/components/ui/button";
import { MOTIVO_MAX } from "@/lib/comunidade/regras";

export interface DialogoMotivoProps {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  descricao?: ReactNode;
  rotulo?: string;
  placeholder?: string;
  textoConfirmar: string;
  /** Motivo já preenchido (ex.: o da denúncia). */
  inicial?: string;
  /** Campos a mais acima do motivo (ex.: dias do silêncio). */
  extra?: ReactNode;
  /** Com isto, "Continuar" abre o modal block (3 s) com este resumo antes de rodar. */
  confirmacao?: (motivo: string) => { titulo: string; mensagem: string };
  /** Roda a action; devolve a mensagem de erro (fica no diálogo) ou `null` (fecha). */
  onConfirmar: (motivo: string) => Promise<string | null>;
}

/**
 * Pede um motivo (denunciar, ocultar, silenciar). Ação crítica passa pelo modal block depois do
 * motivo: o diálogo some, o block mostra o resumo e só então a action roda.
 */
export function DialogoMotivo(p: DialogoMotivoProps) {
  const [motivo, setMotivo] = useState(p.inicial ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [fase, setFase] = useState<"form" | "block">("form");
  const [rodando, setRodando] = useState(false);

  const fechar = () => {
    setMotivo(p.inicial ?? "");
    setErro(null);
    setFase("form");
    p.onFechar();
  };
  const rodar = async () => {
    setRodando(true);
    const e = await p.onConfirmar(motivo.trim()).catch(() => "Sem conexão com o servidor. Tente de novo.");
    setRodando(false);
    if (e) {
      setErro(e);
      setFase("form");
      return;
    }
    fechar();
  };
  const continuar = () => {
    if (motivo.trim().length < 3) return setErro("Informe o motivo (3 letras ou mais).");
    setErro(null);
    if (p.confirmacao) setFase("block");
    else void rodar();
  };
  const block = p.confirmacao && fase === "block" ? p.confirmacao(motivo.trim()) : null;

  return (
    <>
      <DialogoAdmin
        aberto={p.aberto && fase === "form"}
        onFechar={fechar}
        titulo={p.titulo}
        descricao={p.descricao}
        rodape={
          <>
            <Button variant="contorno" size="42" onClick={fechar} disabled={rodando}>
              Cancelar
            </Button>
            <Button size="42" carregando={rodando} onClick={continuar}>
              {p.textoConfirmar}
            </Button>
          </>
        }
      >
        {p.extra}
        <AreaTexto
          rotulo={p.rotulo ?? "Motivo"}
          placeholder={p.placeholder}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={MOTIVO_MAX}
          rows={3}
          erro={erro ?? undefined}
          autoFocus
        />
      </DialogoAdmin>
      <ModalConfirmacaoBlock
        aberto={p.aberto && !!block}
        titulo={block?.titulo ?? ""}
        mensagem={block?.mensagem ?? ""}
        carregando={rodando}
        textoConfirmar={p.textoConfirmar}
        onCancelar={() => setFase("form")}
        onConfirmar={() => void rodar()}
      />
    </>
  );
}
