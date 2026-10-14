"use client";

import { useId, useState, type ReactNode } from "react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";

export interface DialogoTituloProps {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  descricao?: string;
  /** Valor do campo ao abrir (renomear). */
  inicial?: string;
  /** Rótulo do campo (padrão "Título"; material usa "Nome"). */
  rotuloCampo?: string;
  textoSalvar: string;
  carregando: boolean;
  erro: string | null;
  onSalvar: (titulo: string) => void;
  /** Campos extras abaixo do título (situação do módulo). */
  children?: ReactNode;
}

/** Diálogo de um campo de nome (novo módulo, nova aula, renomear módulo ou material). Fecha por ESC: ação não crítica. */
export function DialogoTitulo({ aberto, onFechar, titulo, descricao, inicial = "", rotuloCampo = "Título", textoSalvar, carregando, erro, onSalvar, children }: DialogoTituloProps) {
  const idForm = useId();
  const [valor, setValor] = useState(inicial);
  const [estavaAberto, setEstavaAberto] = useState(aberto);
  // Reabriu: o campo volta ao valor inicial.
  if (aberto !== estavaAberto) {
    setEstavaAberto(aberto);
    if (aberto) setValor(inicial);
  }
  return (
    <DialogoAdmin
      aberto={aberto}
      onFechar={onFechar}
      titulo={titulo}
      descricao={descricao}
      rodape={
        <>
          <Button type="button" variant="contorno" size="42" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" form={idForm} size="42" carregando={carregando}>
            {textoSalvar}
          </Button>
        </>
      }
    >
      <form
        id={idForm}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSalvar(valor);
        }}
      >
        <Campo rotulo={rotuloCampo} value={valor} onChange={(e) => setValor(e.target.value)} required minLength={1} maxLength={160} tamanho="42" autoFocus erro={erro ?? undefined} />
        {children}
      </form>
    </DialogoAdmin>
  );
}
