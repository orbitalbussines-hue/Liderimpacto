"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { acaoExcluirTexto } from "@/lib/actions/conhecimento";
import { ROTA_BASE } from "./comum";

export interface ExcluirTextoProps {
  documentoId: string;
  titulo: string;
  versao: string;
  /** Depois de excluir (padrão: volta à lista). */
  aoExcluir?: () => void;
}

/** Excluir texto da base: modal block de 3 s (exclusão lógica, sai das respostas na hora). */
export function useExcluirTexto({ documentoId, titulo, versao, aoExcluir }: ExcluirTextoProps) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const excluir = async () => {
    setCarregando(true);
    const r = await acaoExcluirTexto({ documentoId, versao }).catch(() => null);
    setCarregando(false);
    setAberto(false);
    if (!r || !r.ok) return setErro(r?.erro ?? "Sem conexão com o servidor. Tente de novo.");
    if (aoExcluir) aoExcluir();
    else router.refresh();
  };
  const modais = (
    <>
      <ModalConfirmacaoBlock
        aberto={aberto}
        titulo="Excluir este texto"
        mensagem={`"${titulo}" sai da Base de conhecimento e o assistente deixa de usá-lo nas respostas. O registro fica no histórico (exclusão lógica).`}
        textoConfirmar="Excluir"
        carregando={carregando}
        onCancelar={() => setAberto(false)}
        onConfirmar={excluir}
      />
      <DialogoAdmin
        aberto={erro !== null}
        onFechar={() => setErro(null)}
        titulo="Não foi possível excluir"
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
  return { abrir: () => setAberto(true), modais };
}

/** Menu "⋮" do texto da equipe na lista: editar e excluir. */
export function AcoesTexto(p: ExcluirTextoProps) {
  const x = useExcluirTexto(p);
  return (
    <div className="flex justify-center">
      <MenuAdmin
        gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações do texto ${p.titulo}`} className="text-muted" />}
        itens={[
          { rotulo: "Editar", icone: <Pencil />, href: `${ROTA_BASE}/textos/${p.documentoId}` },
          { rotulo: "Excluir", icone: <Trash2 />, perigo: true, onSelecionar: x.abrir },
        ]}
      >
        <MoreVertical aria-hidden />
      </MenuAdmin>
      {x.modais}
    </div>
  );
}
