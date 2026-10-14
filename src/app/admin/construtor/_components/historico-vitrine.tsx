"use client";

import { History } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { Button } from "@/components/ui/button";
import { EstadoVazio } from "@/components/ui/estado-vazio";

export interface VersaoPublicada {
  numero: number;
  /** "14/10/2026 15:32" (formatado no servidor). */
  quando: string;
  publicadaPor: string;
}

/** Histórico de publicações: cada versão com quem e quando, e "Trazer para o rascunho" (reverter). */
export function HistoricoVitrine({ aberto, versoes, onFechar, onReverter }: { aberto: boolean; versoes: readonly VersaoPublicada[]; onFechar: () => void; onReverter: (numero: number) => void }) {
  return (
    <DialogoAdmin
      aberto={aberto}
      onFechar={onFechar}
      titulo="Histórico da vitrine"
      descricao="Reverter traz a versão para o rascunho; ela só vai ao ar quando você publicar."
      rodape={
        <Button type="button" variant="contorno" onClick={onFechar}>
          Fechar
        </Button>
      }
    >
      {versoes.length === 0 ? (
        <EstadoVazio icone={<History />} titulo="Nada publicado ainda" descricao="Os alunos veem a vitrine padrão até a primeira publicação." />
      ) : (
        <ol className="m-0 flex max-h-[50vh] list-none flex-col gap-2 overflow-y-auto p-0">
          {versoes.map((v, i) => (
            <li key={v.numero} className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold">
                  Versão {v.numero}
                  {i === 0 && <span className="ml-2 text-[11px] font-bold text-ok">No ar</span>}
                </span>
                <span className="block truncate text-xs text-muted">
                  {v.quando} · {v.publicadaPor}
                </span>
              </span>
              <Button type="button" variant="contorno" size="36" onClick={() => onReverter(v.numero)}>
                Reverter
              </Button>
            </li>
          ))}
        </ol>
      )}
    </DialogoAdmin>
  );
}
