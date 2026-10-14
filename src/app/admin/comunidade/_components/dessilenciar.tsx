"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { acaoDessilenciarMembro } from "@/lib/actions/comunidade-moderacao";

/** Tira o silêncio antes do prazo (modal block). */
export function Dessilenciar({ membroId, nome }: { membroId: string; nome: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const confirmar = async () => {
    setRodando(true);
    const r = await acaoDessilenciarMembro({ membroId }).catch(() => null);
    setRodando(false);
    setAberto(false);
    if (!r?.ok) return setErro(r?.erro ?? "Sem conexão com o servidor. Tente de novo.");
    router.refresh();
  };
  return (
    <>
      <Button variant="contorno" size="36" onClick={() => setAberto(true)}>
        Dessilenciar
      </Button>
      {erro && (
        <Aviso tom="erro" className="fixed right-4 bottom-4 z-50 max-w-sm bg-surface shadow-card">
          {erro}
        </Aviso>
      )}
      <ModalConfirmacaoBlock
        aberto={aberto}
        titulo={`Dessilenciar ${nome}?`}
        mensagem={`${nome} volta a publicar e comentar na comunidade agora, antes do fim do prazo.`}
        textoConfirmar="Dessilenciar"
        carregando={rodando}
        onCancelar={() => setAberto(false)}
        onConfirmar={() => void confirmar()}
      />
    </>
  );
}
