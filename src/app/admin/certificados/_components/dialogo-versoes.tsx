"use client";

import { useRouter } from "next/navigation";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { Button } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";

export interface VersaoDaLista {
  versao: number;
  situacao: "Pronta" | "Gerando" | "Falhou";
  /** "Pedida em 14/10/26 · 13:31 · gerada 13:32 · 84 KB". */
  detalhe: string;
  erro: string | null;
}

const TOM = { Pronta: "ok", Gerando: "accent", Falhou: "warn" } as const;

/** Histórico das versões do PDF (aberto por `?versoes=<id>`; fechar volta para a lista). */
export function DialogoVersoes({ titulo, versoes, hrefFechar }: { titulo: string; versoes: VersaoDaLista[]; hrefFechar: string }) {
  const router = useRouter();
  const fechar = () => router.push(hrefFechar, { scroll: false });
  return (
    <DialogoAdmin
      aberto
      onFechar={fechar}
      titulo="Versões do PDF"
      descricao={titulo}
      rodape={
        <Button size="42" onClick={fechar}>
          Fechar
        </Button>
      }
    >
      {versoes.length === 0 ? (
        <p className="m-0 text-sm text-muted">Nenhuma versão gerada ainda.</p>
      ) : (
        <ol className="m-0 flex max-h-[50vh] list-none flex-col divide-y divide-border overflow-y-auto rounded-xl border border-border p-0">
          {versoes.map((v, i) => (
            <li key={v.versao} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex items-center gap-2">
                <b className="text-sm">v{v.versao}</b>
                <Selo tom={TOM[v.situacao]}>{v.situacao}</Selo>
                {i === 0 && <span className="text-xs text-muted">mais recente</span>}
              </div>
              <div className="text-xs text-muted">{v.detalhe}</div>
              {v.erro && <div className="text-xs font-semibold text-warn">{v.erro}</div>}
            </li>
          ))}
        </ol>
      )}
    </DialogoAdmin>
  );
}
