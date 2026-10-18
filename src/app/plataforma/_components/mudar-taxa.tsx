"use client";

import { useState } from "react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { centesimos, formatarPercentual, textoDeCentesimos } from "@/app/admin/vendas/ofertas/_components/valores";
import { acaoMudarTaxaCriador } from "@/lib/actions/pagamentos";
import { TAXA_MAXIMA_BPS } from "@/lib/pagamentos/regras";

export interface MudarTaxaProps {
  criador: { id: string; nome: string; versao: string; taxaBps: number };
  /** Concluiu (recarrega a lista) ou cancelou. */
  onFechar: (mudou: boolean) => void;
}

/** Taxa da plataforma de um criador (RN-211): digita em %, confere no ModalConfirmacaoBlock e grava. */
export function MudarTaxa({ criador, onFechar }: MudarTaxaProps) {
  const [texto, setTexto] = useState(textoDeCentesimos(criador.taxaBps).replace(/,00$/, ""));
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, setPendente] = useState(false);
  const bps = centesimos(texto);
  const invalida = bps === null || bps > TAXA_MAXIMA_BPS ? "De 0% a 50%, até duas casas (ex.: 8,25)." : bps === criador.taxaBps ? "É a taxa atual." : undefined;

  const gravar = async () => {
    if (bps === null) return;
    setPendente(true);
    const r = await acaoMudarTaxaCriador({ criadorId: criador.id, versao: criador.versao, taxaBps: bps });
    setPendente(false);
    setConfirmando(false);
    if (!r.ok) return setErro(r.erro);
    onFechar(true);
  };

  return (
    <>
      <DialogoAdmin
        aberto={!confirmando}
        onFechar={() => onFechar(false)}
        titulo="Taxa da plataforma"
        descricao={`${criador.nome} paga hoje ${formatarPercentual(criador.taxaBps)} de cada venda. A taxa nova vale para as vendas novas; assinaturas já feitas continuam com a taxa do dia em que foram assinadas.`}
        rodape={
          <>
            <Button variant="contorno" size="42" onClick={() => onFechar(false)}>
              Cancelar
            </Button>
            <Button size="42" disabled={!!invalida} onClick={() => setConfirmando(true)}>
              Continuar
            </Button>
          </>
        }
      >
        <Campo
          rotulo="Nova taxa"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setErro(null);
          }}
          inputMode="decimal"
          tamanho="42"
          className="tabular-nums"
          classNameMoldura="max-w-40"
          sufixo={<span className="text-[13px] text-muted">%</span>}
          erro={erro ?? (texto.trim() && bps !== criador.taxaBps ? invalida : undefined)}
          ajuda="De 0% a 50%. Padrão: 8%."
        />
      </DialogoAdmin>
      <ModalConfirmacaoBlock
        aberto={confirmando}
        titulo="Mudar taxa da plataforma"
        mensagem={`A taxa de ${criador.nome} passa de ${formatarPercentual(criador.taxaBps)} para ${formatarPercentual(bps ?? 0)}. Vale para as vendas novas; vendas já feitas e assinaturas em andamento continuam com a taxa antiga. Fica na trilha.`}
        textoConfirmar="Mudar taxa"
        carregando={pendente}
        onCancelar={() => setConfirmando(false)}
        onConfirmar={gravar}
      />
    </>
  );
}
