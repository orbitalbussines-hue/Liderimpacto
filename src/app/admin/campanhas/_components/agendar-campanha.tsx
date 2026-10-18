"use client";

import { useState } from "react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { ControleSegmentado } from "@/components/ui/controle-segmentado";
import { dataHoraCurta } from "../../conteudos/_components/comum";
import { pessoas, tempoEstimado } from "./comum";

export interface AgendarCampanhaProps {
  aberto: boolean;
  onFechar: () => void;
  assunto: string;
  /** Contagem ao vivo do público (null = ainda contando). */
  receberao: number | null;
  limite: { hora: number; dia: number };
  /** `quando` ISO ou null = agora. */
  onConfirmar: (quando: string | null) => void;
  pendente: boolean;
}

/** "yyyy-mm-ddThh:mm" no fuso do navegador (o que o <input type="datetime-local"> entende). */
const paraCampo = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const amanhaAs9 = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return paraCampo(d);
};

/** Montar só enquanto aberto (o estado recomeça a cada abertura). Escolhe "agora" ou dia e hora; depois a confirmação com bloqueio de 3 s mostra quantas pessoas recebem. */
export function AgendarCampanha({ aberto, onFechar, assunto, receberao, limite, onConfirmar, pendente }: AgendarCampanhaProps) {
  const [modo, setModo] = useState<"agora" | "agendar">("agora");
  const [quando, setQuando] = useState(amanhaAs9);
  const [confirmando, setConfirmando] = useState(false);
  const [aberturaEm] = useState(() => Date.now());
  const data = modo === "agendar" && quando ? new Date(quando) : null;
  const invalida = modo === "agendar" && (!data || Number.isNaN(data.getTime()) || data.getTime() < aberturaEm - 60_000);
  const n = receberao ?? 0;
  const tempo = tempoEstimado(n, limite);
  const fechar = () => {
    setConfirmando(false);
    onFechar();
  };

  return (
    <>
      <DialogoAdmin
        aberto={aberto && !confirmando}
        onFechar={fechar}
        titulo="Enviar campanha"
        descricao={receberao === null ? "Contando quem recebe..." : `${pessoas(n)} ${n === 1 ? "recebe" : "recebem"} este e-mail.`}
        rodape={
          <>
            <Button variant="contorno" size="42" onClick={fechar}>
              Voltar
            </Button>
            <Button size="42" disabled={invalida || receberao === null || n === 0} onClick={() => setConfirmando(true)}>
              Continuar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <ControleSegmentado
            aria-label="Quando enviar"
            opcoes={[
              { valor: "agora", rotulo: "Enviar agora" },
              { valor: "agendar", rotulo: "Agendar" },
            ]}
            valor={modo}
            onMudar={setModo}
            className="self-start"
          />
          {modo === "agendar" && (
            <Campo
              rotulo="Dia e hora"
              type="datetime-local"
              value={quando}
              min={paraCampo(new Date())}
              onChange={(e) => setQuando(e.target.value)}
              tamanho="42"
              erro={invalida ? "Escolha um horário a partir de agora." : undefined}
              ajuda="No horário deste computador. Até um ano à frente. Dá para editar ou cancelar até a hora do envio."
            />
          )}
          {n > 0 && (
            <p className="m-0 text-[13px] text-muted">
              Os e-mails saem aos poucos, até {limite.hora} por hora, para a caixa de e-mail não ser bloqueada: {tempo}.
            </p>
          )}
        </div>
      </DialogoAdmin>
      <ModalConfirmacaoBlock
        aberto={aberto && confirmando}
        titulo={data ? "Agendar campanha" : "Enviar campanha agora"}
        mensagem={`"${assunto}" vai para ${pessoas(n)} ${data ? `em ${dataHoraCurta(data)}` : "a partir de agora"}. Os e-mails saem aos poucos (${tempo}). Depois de começar, só dá para cancelar o que ainda não saiu.`}
        textoConfirmar={data ? "Agendar" : "Enviar agora"}
        carregando={pendente}
        onCancelar={() => setConfirmando(false)}
        onConfirmar={() => onConfirmar(data ? data.toISOString() : null)}
      />
    </>
  );
}
