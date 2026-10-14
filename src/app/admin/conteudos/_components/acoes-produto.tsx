"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { acaoRemoverProduto } from "@/lib/actions/produtos";
import type { StatusProduto } from "@/lib/db/schema/_enums";

export interface AcoesProdutoProps {
  produto: { id: string; titulo: string; status: StatusProduto; versao: string };
}

/** ⋮ da linha: editar (link) e remover (modal block; só rascunho, com toda a estrutura). */
export function AcoesProduto({ produto }: AcoesProdutoProps) {
  const router = useRouter();
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const rascunho = produto.status === "RASCUNHO";
  return (
    <div className="flex justify-center">
      <MenuAdmin
        gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações do produto ${produto.titulo}`} className="text-muted" />}
        itens={[
          { rotulo: "Editar", icone: <Pencil />, href: `/admin/conteudos/${produto.id}` },
          { rotulo: "Remover", icone: <Trash2 />, perigo: true, onSelecionar: () => setRemovendo(true) },
        ]}
      >
        <MoreVertical aria-hidden />
      </MenuAdmin>
      <ModalConfirmacaoBlock
        aberto={removendo}
        titulo="Remover produto"
        mensagem={
          rascunho
            ? `"${produto.titulo}" sai da lista com todos os módulos, aulas e materiais (exclusão lógica, fica na trilha). As imagens e anexos são apagados do armazenamento.`
            : `"${produto.titulo}" está visível para os alunos: a remoção será recusada. Mude a situação para Rascunho antes.`
        }
        textoConfirmar="Remover"
        carregando={pendente}
        onCancelar={() => setRemovendo(false)}
        onConfirmar={() =>
          iniciar(async () => {
            const r = await acaoRemoverProduto({ produtoId: produto.id, versao: produto.versao });
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
