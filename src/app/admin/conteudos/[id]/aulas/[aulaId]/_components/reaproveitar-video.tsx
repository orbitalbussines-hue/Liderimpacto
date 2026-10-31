"use client";

import { useState, useTransition } from "react";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Selecao, type OpcaoSelecao } from "@/components/ui/selecao";
import { acaoReaproveitarVideo } from "@/lib/actions/videos";

export interface ReaproveitarVideoProps {
  aulaId: string;
  /** Vídeos prontos das outras aulas (agrupados por curso). */
  opcoes: readonly OpcaoSelecao[];
  /** Nome do vídeo atual da aula: existindo, a troca passa pelo modal block. */
  nomeAtual: string | null;
  onFeito: () => void;
  onCancelar: () => void;
}

/**
 * "Usar vídeo de outra aula": escolhe um vídeo já processado e a aula o recebe pronto, sem
 * envio nem fila. Trocar o vídeo atual exige o modal block, como no envio.
 */
export function ReaproveitarVideo({ aulaId, opcoes, nomeAtual, onFeito, onCancelar }: ReaproveitarVideoProps) {
  const [escolhido, setEscolhido] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciarTransicao] = useTransition();

  const aplicar = () =>
    iniciarTransicao(async () => {
      const r = await acaoReaproveitarVideo({ aulaId, videoOrigemId: escolhido, substituir: nomeAtual !== null });
      if (!r.ok) return setErro(r.erro);
      onFeito();
    });

  return (
    <div className="flex flex-col gap-2">
      <Selecao
        rotulo="Vídeo de outra aula"
        opcoes={opcoes}
        vazio="Escolha a aula"
        value={escolhido}
        onChange={(e) => setEscolhido(e.target.value)}
        ajuda="O vídeo entra pronto, sem novo envio. Trocar ou excluir o vídeo de uma aula não afeta a outra."
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="36" disabled={!escolhido} carregando={pendente} onClick={() => (nomeAtual === null ? aplicar() : setConfirmando(true))}>
          Usar este vídeo
        </Button>
        <Button type="button" variant="fantasma" size="36" disabled={pendente} onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <ModalConfirmacaoBlock
        aberto={confirmando}
        titulo="Trocar o vídeo da aula"
        mensagem={`O vídeo atual (${nomeAtual ?? ""}) sai desta aula e entra o vídeo escolhido, já pronto para assistir.`}
        textoConfirmar="Trocar vídeo"
        onCancelar={() => setConfirmando(false)}
        onConfirmar={() => {
          setConfirmando(false);
          aplicar();
        }}
      />
    </div>
  );
}
