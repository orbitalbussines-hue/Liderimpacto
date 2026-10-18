"use client";

import { useState } from "react";
import { MoreVertical, Pencil, Send, Trash2 } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { acaoExcluirModeloEmail } from "@/lib/actions/campanhas";
import { useAcao } from "../../membros/_components/use-acao";

/** Menu do modelo: editar, usar numa campanha nova e excluir (bloqueio de 3 s). */
export function AcoesModelo({ modelo }: { modelo: { id: string; nome: string; versao: string } }) {
  const [excluindo, setExcluindo] = useState(false);
  const { erro, setErro, pendente, rodar } = useAcao();
  const fechar = () => {
    setExcluindo(false);
    setErro(null);
  };
  return (
    <div className="flex justify-center">
      <MenuAdmin
        gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações do modelo ${modelo.nome}`} className="text-muted" />}
        itens={[
          { rotulo: "Editar", icone: <Pencil />, href: `/admin/campanhas/modelos/${modelo.id}` },
          { rotulo: "Usar em campanha nova", icone: <Send />, href: `/admin/campanhas/nova?modelo=${modelo.id}` },
          { rotulo: "Excluir", icone: <Trash2 />, perigo: true, onSelecionar: () => setExcluindo(true) },
        ]}
      >
        <MoreVertical aria-hidden />
      </MenuAdmin>
      <ModalConfirmacaoBlock
        aberto={excluindo && erro === null}
        titulo="Excluir modelo"
        mensagem={`"${modelo.nome}" sai da lista de modelos. Campanhas e automações criadas com ele não mudam.`}
        textoConfirmar="Excluir"
        carregando={pendente}
        onCancelar={fechar}
        onConfirmar={() => rodar(() => acaoExcluirModeloEmail({ modeloId: modelo.id, versao: modelo.versao }), fechar)}
      />
      <DialogoAdmin
        aberto={erro !== null}
        onFechar={fechar}
        titulo="Não foi possível excluir"
        descricao={erro}
        rodape={
          <Button size="42" onClick={fechar}>
            Entendi
          </Button>
        }
      />
    </div>
  );
}
