"use client";

import { Eye, EyeOff, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { useAcoesTrilha, type TrilhaAcionavel } from "./use-acoes-trilha";

/** Menu "⋮" da trilha na lista: editar, publicar/despublicar e remover (modal block). */
export function AcoesTrilha({ trilha }: { trilha: TrilhaAcionavel }) {
  const a = useAcoesTrilha(trilha);
  const itens: ItemMenuAdmin[] = [
    { rotulo: "Editar", icone: <Pencil />, href: `/admin/trilhas/${trilha.id}` },
    a.publicada
      ? { rotulo: "Despublicar", icone: <EyeOff />, onSelecionar: a.abrirSituacao }
      : { rotulo: "Publicar", icone: <Eye />, onSelecionar: a.abrirSituacao },
    { rotulo: "Remover", icone: <Trash2 />, perigo: true, onSelecionar: a.abrirRemover },
  ];
  return (
    <div className="flex justify-center">
      <MenuAdmin gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações da trilha ${trilha.titulo}`} className="text-muted" />} itens={itens}>
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
