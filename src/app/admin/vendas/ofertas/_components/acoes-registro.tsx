"use client";

import { useState, type ReactNode } from "react";
import { MoreVertical, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { useAcao } from "@/app/admin/membros/_components/use-acao";
import type { Resultado } from "@/lib/acao";

export interface AcoesRegistroProps {
  /** "a oferta Curso X" (aria do menu). */
  descricao: string;
  ativo: boolean;
  mudarSituacao: () => Promise<Resultado<unknown>>;
  excluir: () => Promise<Resultado<unknown>>;
  tituloExcluir: string;
  mensagemExcluir: string;
  /** Formulário de edição (montado só enquanto aberto). */
  formEditar: (fechar: () => void) => ReactNode;
}

/**
 * Menu da linha de Ofertas, Cupons e Afiliados: editar, pausar/ativar e excluir (ModalConfirmacaoBlock,
 * exclusão lógica). A action confere papel e trava (versão); aqui é só a tela.
 */
export function AcoesRegistro({ descricao, ativo, mudarSituacao, excluir, tituloExcluir, mensagemExcluir, formEditar }: AcoesRegistroProps) {
  const [editando, setEditando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const { erro, setErro, pendente, rodar } = useAcao();
  const fechar = () => {
    setExcluindo(false);
    setErro(null);
  };
  const itens: ItemMenuAdmin[] = [
    { rotulo: "Editar", icone: <Pencil />, onSelecionar: () => setEditando(true) },
    ativo
      ? { rotulo: "Pausar", icone: <Pause />, onSelecionar: () => rodar(mudarSituacao, () => undefined) }
      : { rotulo: "Ativar", icone: <Play />, onSelecionar: () => rodar(mudarSituacao, () => undefined) },
    { rotulo: "Excluir", icone: <Trash2 />, perigo: true, onSelecionar: () => setExcluindo(true) },
  ];
  return (
    <div className="flex justify-center">
      <MenuAdmin gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações de ${descricao}`} className="text-muted" />} itens={itens}>
        <MoreVertical aria-hidden />
      </MenuAdmin>
      {editando && formEditar(() => setEditando(false))}
      <ModalConfirmacaoBlock
        aberto={excluindo && erro === null}
        titulo={tituloExcluir}
        mensagem={mensagemExcluir}
        textoConfirmar="Excluir"
        carregando={pendente}
        onCancelar={fechar}
        onConfirmar={() => rodar(excluir, fechar)}
      />
      <DialogoAdmin
        aberto={erro !== null && !editando}
        onFechar={fechar}
        titulo="Não foi possível concluir"
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
