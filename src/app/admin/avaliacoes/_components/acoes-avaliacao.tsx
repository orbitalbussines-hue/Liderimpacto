"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MoreVertical, Pencil, Trash2, Users } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { acaoRemoverAvaliacao } from "@/lib/actions/avaliacoes";

export interface AcoesAvaliacaoProps {
  avaliacao: { id: string; titulo: string; questoes: number; tentativas: number; versao: string };
}

/** ⋮ da linha: editar, alunos e remover (modal block; recusa se estiver numa trilha). */
export function AcoesAvaliacao({ avaliacao }: AcoesAvaliacaoProps) {
  const router = useRouter();
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const base = `/admin/avaliacoes/${avaliacao.id}`;
  return (
    <div className="flex justify-center">
      <MenuAdmin
        gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações da avaliação ${avaliacao.titulo}`} className="text-muted" />}
        itens={[
          { rotulo: "Editar", icone: <Pencil />, href: base },
          { rotulo: "Alunos", icone: <Users />, href: `${base}/alunos` },
          { rotulo: "Remover", icone: <Trash2 />, perigo: true, onSelecionar: () => setRemovendo(true) },
        ]}
      >
        <MoreVertical aria-hidden />
      </MenuAdmin>
      <ModalConfirmacaoBlock
        aberto={removendo}
        titulo="Remover avaliação"
        mensagem={`"${avaliacao.titulo}" sai da lista com ${avaliacao.questoes} ${avaliacao.questoes === 1 ? "questão" : "questões"} e some para os alunos (exclusão lógica, fica na trilha). ${
          avaliacao.tentativas > 0 ? `As ${avaliacao.tentativas} tentativas já feitas ficam no histórico.` : ""
        }`.trim()}
        textoConfirmar="Remover"
        carregando={pendente}
        onCancelar={() => setRemovendo(false)}
        onConfirmar={() =>
          iniciar(async () => {
            const r = await acaoRemoverAvaliacao({ avaliacaoId: avaliacao.id, versao: avaliacao.versao });
            setRemovendo(false);
            if (!r.ok) return setErro(r.erro);
            router.refresh();
          })
        }
      />
      <DialogoAdmin
        aberto={erro !== null}
        onFechar={() => setErro(null)}
        titulo="Não foi possível remover"
        descricao={erro}
        rodape={
          <Button size="42" onClick={() => setErro(null)}>
            Entendi
          </Button>
        }
      />
    </div>
  );
}
