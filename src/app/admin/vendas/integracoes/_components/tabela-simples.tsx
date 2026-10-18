import { CelulaTabela } from "@/components/admin/celula-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { cn } from "@/lib/utils";

/**
 * A tabela do `PaginaTabela` sem o cartão nem o cabeçalho: para uma seção dentro da `MolduraAbas`.
 * Rola na horizontal no celular, como as listas do admin.
 */
export function TabelaSimples({ colunas, linhas, chaves, vazio }: { colunas: readonly Coluna[]; linhas: readonly Linha[]; chaves: readonly string[]; vazio: string }) {
  if (linhas.length === 0) return <p className="m-0 rounded-md border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted">{vazio}</p>;
  const minimo = colunas.reduce((s, c) => s + (c.largura ?? 200), 0);
  return (
    <div className="relative overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-left text-[13px]" style={{ minWidth: minimo }}>
        <thead>
          <tr className="border-b border-border bg-surface-2 text-xs text-muted">
            {colunas.map((c) => (
              <th key={c.titulo} scope="col" style={c.largura ? { width: c.largura } : { minWidth: 200 }} className={cn("px-3 py-2.5 font-normal first:pl-4 last:pr-4", c.alinhar === "direita" && "text-right")}>
                {c.titulo === "Ações" ? <span className="sr-only">{c.titulo}</span> : c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={chaves[i]} className="border-b border-border last:border-b-0">
              {linha.map((celula, j) => (
                <td key={j} className={cn("px-3 py-2 align-middle first:pl-4 last:pr-4", colunas[j]?.alinhar === "direita" && "text-right tabular-nums")}>
                  <CelulaTabela celula={celula} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
