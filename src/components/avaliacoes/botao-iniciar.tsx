"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button, buttonVariants } from "@/components/ui/button";
import { acaoIniciarTentativa } from "@/lib/actions/avaliacoes-aluno";

export interface BotaoIniciarProps {
  avaliacaoId: string;
  /** "Iniciar" | "Tentar de novo". */
  rotulo: string;
  tempoLimiteMin: number | null;
  /** Tentativa aberta: o botão vira "Continuar" (link direto, sem nova tentativa). */
  tentativaAbertaId: string | null;
}

/**
 * Inicia (ou retoma) a tentativa no servidor e leva à tela de responder. Com tempo limite, o
 * modal block avisa antes que o cronômetro começa e não pausa.
 */
export function BotaoIniciar({ avaliacaoId, rotulo, tempoLimiteMin, tentativaAbertaId }: BotaoIniciarProps) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  if (tentativaAbertaId) {
    return (
      <Link href={`/avaliacoes/${avaliacaoId}/tentativa/${tentativaAbertaId}`} className={buttonVariants({ size: "46", className: "self-start px-6" })}>
        Continuar tentativa
      </Link>
    );
  }
  const comecar = () =>
    iniciar(async () => {
      setErro(null);
      const r = await acaoIniciarTentativa({ avaliacaoId });
      setConfirmando(false);
      if (!r.ok) return setErro(r.erro);
      router.push(`/avaliacoes/${avaliacaoId}/tentativa/${r.dados.tentativaId}`);
    });

  return (
    <div className="flex flex-col items-start gap-3">
      <Button size="46" className="px-6" carregando={pendente && !confirmando} onClick={() => (tempoLimiteMin ? setConfirmando(true) : comecar())}>
        {rotulo}
      </Button>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <ModalConfirmacaoBlock
        aberto={confirmando}
        titulo="Começar com tempo marcado"
        mensagem={`Você terá ${tempoLimiteMin} min a partir de agora. O tempo não pausa se você sair da página; ao zerar, a tentativa é corrigida com o que você já respondeu.`}
        textoConfirmar="Começar agora"
        carregando={pendente}
        onCancelar={() => setConfirmando(false)}
        onConfirmar={comecar}
      />
    </div>
  );
}
