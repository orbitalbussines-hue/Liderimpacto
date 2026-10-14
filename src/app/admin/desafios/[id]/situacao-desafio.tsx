"use client";

import { Ban, Eye, Trash2 } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { useAcoesDesafio, type DesafioAcionavel } from "../_components/use-acoes-desafio";

/** Botões de situação no painel lateral do editor (mesmos modais do menu da lista). */
export function SituacaoDesafio({ desafio }: { desafio: DesafioAcionavel }) {
  const a = useAcoesDesafio(desafio, "/admin/desafios");
  if (!a.podePublicar && !a.podeEncerrar && !a.podeExcluir) return null;
  return (
    <div className="flex flex-col gap-2">
      {a.podePublicar && (
        <Button size="40" larguraTotal onClick={() => a.abrir("publicar")}>
          <Eye aria-hidden />
          Publicar
        </Button>
      )}
      {a.podeEncerrar && (
        <Button variant="contorno" size="40" larguraTotal onClick={() => a.abrir("encerrar")}>
          <Ban aria-hidden />
          Encerrar agora
        </Button>
      )}
      {a.podeExcluir && (
        <Button variant="fantasma" size="40" larguraTotal className="text-warn" onClick={() => a.abrir("excluir")}>
          <Trash2 aria-hidden />
          Excluir rascunho
        </Button>
      )}
      {a.erro && <Aviso tom="erro">{a.erro}</Aviso>}
      {a.modais}
    </div>
  );
}
