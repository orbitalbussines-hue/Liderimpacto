"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PackageCheck } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { acaoMarcarRecompensaEntregue } from "@/lib/actions/gamificacao";

export interface MarcarEntregueProps {
  participacaoId: string;
  /** `updated_at` ISO da participação (trava). */
  versao: string;
  nome: string;
  recompensa: string;
  desafio: string;
}

/** "Marcar como entregue": modal block de 3 s (não se desfaz pela tela) e trilha na action. */
export function MarcarEntregue({ participacaoId, versao, nome, recompensa, desafio }: MarcarEntregueProps) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <>
      <Button variant="contorno" size="36" onClick={() => setAberto(true)}>
        <PackageCheck aria-hidden />
        Marcar como entregue
      </Button>
      <ModalConfirmacaoBlock
        aberto={aberto}
        titulo="Marcar recompensa como entregue"
        mensagem={`Registrar que ${nome} recebeu "${recompensa}" (desafio "${desafio}"). Fica na trilha de auditoria com o seu nome e não dá para desmarcar pela tela.`}
        textoConfirmar="Marcar como entregue"
        carregando={pendente}
        onCancelar={() => setAberto(false)}
        onConfirmar={() =>
          iniciar(async () => {
            const r = await acaoMarcarRecompensaEntregue({ participacaoId, versao }).catch(() => null);
            setAberto(false);
            if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
            if (!r.ok) return setErro(r.erro);
            router.refresh();
          })
        }
      />
      <DialogoAdmin
        aberto={erro !== null}
        onFechar={() => setErro(null)}
        titulo="Não foi possível concluir"
        rodape={
          <Button size="42" onClick={() => setErro(null)}>
            Entendi
          </Button>
        }
      >
        <Aviso tom="erro">{erro}</Aviso>
      </DialogoAdmin>
    </>
  );
}
