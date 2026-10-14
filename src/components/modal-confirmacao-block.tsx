"use client";

import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

const SEGUNDOS_DE_BLOCK = 3;

interface ModalConfirmacaoBlockProps {
  aberto: boolean;
  titulo: string;
  /** Resumo claro do que vai acontecer. */
  mensagem: string;
  onConfirmar: () => void;
  onCancelar: () => void;
  /** Trava os botoes enquanto a action roda. */
  carregando?: boolean;
  textoConfirmar?: string;
}

/**
 * Confirmacao de acao critica (RN-003): os botoes so liberam depois de 3 s.
 * Nao fecha por ESC nem por clique fora — so pelos botoes. Quem garante isso e
 * o `open` controlado SEM `onOpenChange`: a biblioteca pede para fechar e
 * ninguem atende. Nao acrescente `onOpenChange` aqui.
 */
export function ModalConfirmacaoBlock({ aberto, ...resto }: ModalConfirmacaoBlockProps) {
  return (
    <AlertDialog open={aberto}>
      {/* O corpo desmonta ao fechar: a contagem recomeca a cada abertura. */}
      {aberto && <Corpo {...resto} />}
    </AlertDialog>
  );
}

function Corpo({
  titulo,
  mensagem,
  onConfirmar,
  onCancelar,
  carregando = false,
  textoConfirmar = "Confirmar",
}: Omit<ModalConfirmacaoBlockProps, "aberto">) {
  const [restante, setRestante] = useState(SEGUNDOS_DE_BLOCK);

  useEffect(() => {
    if (restante === 0) return;
    const id = setTimeout(() => setRestante(restante - 1), 1000);
    return () => clearTimeout(id);
  }, [restante]);

  const travado = restante > 0 || carregando;

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{titulo}</AlertDialogTitle>
        <AlertDialogDescription>{mensagem}</AlertDialogDescription>
      </AlertDialogHeader>
      {restante > 0 && (
        <p className="text-[13px] font-semibold text-accent" aria-live="polite">
          Leia com atenção. Botões liberados em {restante}s.
        </p>
      )}
      <AlertDialogFooter>
        <Button variant="contorno" size="42" disabled={travado} onClick={onCancelar}>
          Cancelar
        </Button>
        <Button size="42" disabled={travado} carregando={carregando} onClick={onConfirmar}>
          {carregando ? "Processando..." : textoConfirmar}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
