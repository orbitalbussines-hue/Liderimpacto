"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { AreaTexto } from "@/components/ui/area-texto";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { acaoConcederTentativa } from "@/lib/actions/avaliacoes";

export interface ConcederTentativaProps {
  avaliacaoId: string;
  aluno: { membroId: string; nome: string };
}

/** "+1 tentativa": motivo no diálogo, confirmação no modal block (fica na trilha). */
export function ConcederTentativa({ avaliacaoId, aluno }: ConcederTentativaProps) {
  const router = useRouter();
  const idForm = useId();
  const [etapa, setEtapa] = useState<"motivo" | "confirmar" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const curto = motivo.trim().length < 3;
  return (
    <>
      <Button
        variant="contorno"
        size="36"
        onClick={() => {
          setMotivo("");
          setErro(null);
          setEtapa("motivo");
        }}
      >
        <Plus className="size-3.5" aria-hidden />
        Conceder tentativa
      </Button>
      <DialogoAdmin
        aberto={etapa === "motivo"}
        onFechar={() => setEtapa(null)}
        titulo="Conceder +1 tentativa"
        descricao={`${aluno.nome} esgotou as tentativas sem aprovar. Diga por que a nova tentativa está sendo liberada.`}
        rodape={
          <>
            <Button variant="contorno" size="42" onClick={() => setEtapa(null)}>
              Cancelar
            </Button>
            <Button type="submit" form={idForm} size="42" disabled={curto}>
              Continuar
            </Button>
          </>
        }
      >
        <form
          id={idForm}
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!curto) setEtapa("confirmar");
          }}
        >
          <AreaTexto rotulo="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={500} required autoFocus ajuda="Mínimo de 3 caracteres. Fica registrado na trilha." />
          {erro && <Aviso tom="erro">{erro}</Aviso>}
        </form>
      </DialogoAdmin>
      <ModalConfirmacaoBlock
        aberto={etapa === "confirmar"}
        titulo="Conceder +1 tentativa"
        mensagem={`${aluno.nome} poderá fazer mais uma tentativa nesta avaliação. Motivo: "${motivo.trim()}".`}
        textoConfirmar="Conceder"
        carregando={pendente}
        onCancelar={() => setEtapa("motivo")}
        onConfirmar={() =>
          iniciar(async () => {
            const r = await acaoConcederTentativa({ avaliacaoId, membroId: aluno.membroId, quantidade: 1, motivo });
            if (!r.ok) {
              setErro(r.erro);
              return setEtapa("motivo");
            }
            setEtapa(null);
            router.refresh();
          })
        }
      />
    </>
  );
}
