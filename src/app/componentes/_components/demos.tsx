"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { EstadoErro } from "@/components/ui/estado-erro";
import { FiltroAtivo } from "@/components/ui/filtro-ativo";

/** Exemplos que precisam de estado/evento (o resto do catalogo e Server Component). */
export function DemoModal() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="perigo" onClick={() => setAberto(true)}>
        <Trash2 aria-hidden />
        Remover fileira
      </Button>
      <ModalConfirmacaoBlock
        aberto={aberto}
        titulo="Remover a fileira “Mentorias gravadas”?"
        mensagem="Ela sai da vitrine de todos os alunos na próxima publicação. Os conteúdos continuam no catálogo."
        textoConfirmar="Remover fileira"
        onConfirmar={() => setAberto(false)}
        onCancelar={() => setAberto(false)}
      />
    </>
  );
}

export function DemoEstadoErro() {
  const [tentativas, setTentativas] = useState(0);
  return (
    <EstadoErro
      mensagem={tentativas ? `Ainda sem conexão (${tentativas}ª tentativa).` : undefined}
      onTentarNovamente={() => setTentativas((n) => n + 1)}
    />
  );
}

export function DemoFiltroAtivo() {
  const [ativo, setAtivo] = useState(true);
  return ativo ? (
    <FiltroAtivo rotulo="Situação · Publicado" onRemover={() => setAtivo(false)} />
  ) : (
    <Button variant="link" size="36" onClick={() => setAtivo(true)}>
      Reaplicar filtro
    </Button>
  );
}
