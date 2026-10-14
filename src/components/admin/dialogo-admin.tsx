"use client";

import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface DialogoAdminProps {
  aberto: boolean;
  /** ESC e o botão de fechar chamam aqui (ação NÃO crítica; crítica = ModalConfirmacaoBlock). */
  onFechar: () => void;
  titulo: string;
  descricao?: ReactNode;
  children?: ReactNode;
  /** Botões (Cancelar/Salvar). */
  rodape: ReactNode;
}

/**
 * Diálogo de formulário do admin (gerar link, grupos, renomear): o mesmo cartão do
 * AlertDialog, mas fecha por ESC. O corpo desmonta ao fechar — estado (e link) não sobra.
 */
export function DialogoAdmin({ aberto, onFechar, titulo, descricao, children, rodape }: DialogoAdminProps) {
  return (
    <AlertDialog open={aberto} onOpenChange={(abrir) => !abrir && onFechar()}>
      {aberto && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[22px]">{titulo}</AlertDialogTitle>
            {descricao && <AlertDialogDescription>{descricao}</AlertDialogDescription>}
          </AlertDialogHeader>
          {children}
          <AlertDialogFooter>{rodape}</AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
