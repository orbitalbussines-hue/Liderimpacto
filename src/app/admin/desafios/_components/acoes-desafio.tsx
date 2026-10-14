"use client";

import { Ban, Eye, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { useAcoesDesafio, type DesafioAcionavel } from "./use-acoes-desafio";

/** Menu "⋮" do desafio na lista: abrir/editar, publicar, encerrar e excluir rascunho. */
export function AcoesDesafio({ desafio }: { desafio: DesafioAcionavel }) {
  const a = useAcoesDesafio(desafio);
  const itens: ItemMenuAdmin[] = [
    { rotulo: desafio.situacao === "ENCERRADO" ? "Ver participantes" : "Editar", icone: <Pencil />, href: `/admin/desafios/${desafio.id}` },
    ...(a.podePublicar ? [{ rotulo: "Publicar", icone: <Eye />, onSelecionar: () => a.abrir("publicar") }] : []),
    ...(a.podeEncerrar ? [{ rotulo: "Encerrar", icone: <Ban />, onSelecionar: () => a.abrir("encerrar") }] : []),
    ...(a.podeExcluir ? [{ rotulo: "Excluir", icone: <Trash2 />, perigo: true, onSelecionar: () => a.abrir("excluir") }] : []),
  ];
  return (
    <div className="flex justify-center">
      <MenuAdmin gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações do desafio ${desafio.titulo}`} className="text-muted" />} itens={itens}>
        <MoreVertical aria-hidden />
      </MenuAdmin>
      {a.modais}
      <DialogoAdmin
        aberto={a.erro !== null}
        onFechar={() => a.setErro(null)}
        titulo="Não foi possível concluir"
        rodape={
          <Button size="42" onClick={() => a.setErro(null)}>
            Entendi
          </Button>
        }
      >
        <Aviso tom="erro">{a.erro}</Aviso>
      </DialogoAdmin>
    </div>
  );
}
