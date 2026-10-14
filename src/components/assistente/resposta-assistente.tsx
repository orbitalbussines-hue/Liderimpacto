import Link from "next/link";
import { hrefDaFonte } from "@/lib/assistente/regras";
import { blocosDoTexto, type Parte } from "@/lib/assistente/texto";
import type { FonteMensagem } from "@/lib/db/schema/assistente";
import { formatarTempo } from "@/lib/validators/catalogo";

export interface RespostaAssistenteProps {
  texto: string;
  /** Fontes que podem ser citadas (`[n]` sem fonte correspondente vira texto). */
  fontes: readonly FonteMensagem[];
  /** Lista "Fontes" embaixo (só depois que a resposta terminou). */
  mostrarFontes?: boolean;
}

const rotuloDaFonte = (f: FonteMensagem) => `${f.origem} · ${f.titulo}${f.inicioSeg != null ? ` · ${formatarTempo(f.inicioSeg)}` : ""}`;

function Citacao({ n, fonte }: { n: number; fonte: FonteMensagem | undefined }) {
  if (!fonte) return <>[{n}]</>;
  const classe = "ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-surface-2 px-1 align-[1px] text-[11px] font-bold text-muted no-underline";
  const href = hrefDaFonte(fonte);
  return href ? (
    <Link href={href} className={`${classe} hover:text-accent focus-visible:text-accent`} aria-label={`Fonte ${n}: ${rotuloDaFonte(fonte)}`} title={rotuloDaFonte(fonte)}>
      {n}
    </Link>
  ) : (
    <span className={classe} title={rotuloDaFonte(fonte)}>
      {n}
    </span>
  );
}

function Partes({ partes, fontes }: { partes: Parte[]; fontes: readonly FonteMensagem[] }) {
  return partes.map((p, i) =>
    p.tipo === "texto" ? (
      <span key={i}>{p.texto}</span>
    ) : p.tipo === "negrito" ? (
      <strong key={i} className="font-bold">
        {p.texto}
      </strong>
    ) : (
      <Citacao key={i} n={p.n} fonte={fontes.find((f) => f.n === p.n)} />
    ),
  );
}

/**
 * Resposta do assistente como TEXTO (ADR-0014): parágrafos, listas, negrito e citações `[n]` com
 * link para a aula no ponto citado (`?t=`). Nada de HTML vindo do modelo: só elementos montados aqui.
 */
export function RespostaAssistente({ texto, fontes, mostrarFontes = true }: RespostaAssistenteProps) {
  const blocos = blocosDoTexto(texto);
  const citadas = fontes.filter((f) => new RegExp(`\\[${f.n}\\]`).test(texto));
  return (
    <div className="flex flex-col gap-2.5 text-[14.5px] leading-[1.65]">
      {blocos.map((b, i) =>
        b.tipo === "paragrafo" ? (
          <p key={i} className="m-0">
            <Partes partes={b.partes} fontes={fontes} />
          </p>
        ) : b.ordenada ? (
          <ol key={i} className="m-0 flex list-decimal flex-col gap-1 pl-5">
            {b.itens.map((item, j) => (
              <li key={j}>
                <Partes partes={item} fontes={fontes} />
              </li>
            ))}
          </ol>
        ) : (
          <ul key={i} className="m-0 flex list-disc flex-col gap-1 pl-5">
            {b.itens.map((item, j) => (
              <li key={j}>
                <Partes partes={item} fontes={fontes} />
              </li>
            ))}
          </ul>
        ),
      )}
      {mostrarFontes && citadas.length > 0 && (
        <div className="mt-1 border-t border-border pt-2.5">
          <p className="m-0 mb-1.5 text-xs font-bold text-muted">Fontes</p>
          <ol className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
            {citadas.map((f) => {
              const href = hrefDaFonte(f);
              return (
                <li key={f.n} className="flex min-w-0 items-baseline gap-2">
                  <span className="w-4 shrink-0 text-right text-xs font-bold text-muted">{f.n}</span>
                  {href ? (
                    <Link href={href} className="min-w-0 truncate font-medium text-text underline-offset-2 hover:text-accent hover:underline">
                      {rotuloDaFonte(f)}
                    </Link>
                  ) : (
                    <span className="min-w-0 truncate text-muted">{rotuloDaFonte(f)}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
