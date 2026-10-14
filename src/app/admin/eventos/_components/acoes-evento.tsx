"use client";

import { Ban, MoreVertical, Pencil, Send, Trash2, Users } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { useAcoesEvento, type EventoAcionavel } from "./use-acoes-evento";

/** Menu "⋮" do evento na lista: editar, inscritos, publicar, cancelar e excluir (modal block). */
export function AcoesEvento({ evento }: { evento: EventoAcionavel }) {
  const a = useAcoesEvento(evento);
  const itens: ItemMenuAdmin[] = [
    { rotulo: evento.situacao === "CANCELADO" ? "Ver" : "Editar", icone: <Pencil />, href: `/admin/eventos/${evento.id}` },
    ...(evento.situacao !== "RASCUNHO" ? [{ rotulo: "Confirmados", icone: <Users />, href: `/admin/eventos/${evento.id}#confirmados` }] : []),
    ...(a.podePublicar ? [{ rotulo: "Publicar", icone: <Send />, onSelecionar: a.abrirPublicar }] : []),
    ...(a.podeCancelar ? [{ rotulo: "Cancelar encontro", icone: <Ban />, perigo: true, onSelecionar: a.abrirCancelar }] : []),
    ...(a.podeExcluir ? [{ rotulo: "Excluir rascunho", icone: <Trash2 />, perigo: true, onSelecionar: a.abrirExcluir }] : []),
  ];
  return (
    <div className="flex justify-center">
      <MenuAdmin gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações do evento ${evento.titulo}`} className="text-muted" />} itens={itens}>
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
