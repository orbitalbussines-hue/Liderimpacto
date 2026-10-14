"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CampoBusca } from "@/components/ui/campo-busca";
import { Esqueleto } from "@/components/ui/esqueleto";
import { EstadoErro } from "@/components/ui/estado-erro";
import { buscarTrechos, lerLegenda, partesComDestaque, trechoAtual, type Trecho } from "@/lib/legendas/regras";
import { cn } from "@/lib/utils";
import { formatarTempo } from "@/lib/validators/catalogo";

export interface TranscricaoAulaProps {
  /** Rota do `.vtt` (a mesma do `<track>`: só quem pode assistir). */
  url: string;
  /** A aba está aberta: o `.vtt` só é baixado na primeira vez que ela abre. */
  ativa: boolean;
  /** Segundo atual do vídeo (sobe do player 1x/s). */
  tempo: number;
  onIrPara: (seg: number) => void;
}

const NENHUM: Trecho[] = [];

/**
 * Aba Transcrição (RN-180): os trechos da legenda com o tempo; clicar leva o vídeo ao trecho; o
 * trecho que está tocando fica destacado e a lista o acompanha; busca sem acento/caixa. Só texto
 * (o React escapa; o termo é marcado por `partesComDestaque`, nunca HTML montado).
 */
export function TranscricaoAula({ url, ativa, tempo, onIrPara }: TranscricaoAulaProps) {
  const [trechos, setTrechos] = useState<Trecho[] | "erro" | null>(null);
  const [termo, setTermo] = useState("");
  const lista = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!ativa || trechos !== null) return;
    let valendo = true;
    fetch(url, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((texto) => valendo && setTrechos(lerLegenda(texto)))
      .catch(() => valendo && setTrechos("erro"));
    return () => {
      valendo = false;
    };
  }, [ativa, trechos, url]);

  const itens = Array.isArray(trechos) ? trechos : NENHUM;
  const achados = useMemo(() => buscarTrechos(itens, termo), [itens, termo]);
  const atual = trechoAtual(itens, tempo);
  const buscando = termo.trim() !== "";

  // A lista acompanha o trecho atual (rola só a lista, nunca a página).
  useEffect(() => {
    const caixa = lista.current;
    const el = caixa?.querySelector<HTMLElement>("[aria-current=true]");
    if (!ativa || buscando || !caixa || !el) return;
    if (el.offsetTop < caixa.scrollTop || el.offsetTop + el.offsetHeight > caixa.scrollTop + caixa.clientHeight) {
      caixa.scrollTo({ top: Math.max(0, el.offsetTop - caixa.clientHeight / 3), behavior: "smooth" });
    }
  }, [atual, ativa, buscando]);

  if (trechos === "erro") return <EstadoErro titulo="Não foi possível abrir a transcrição" mensagem="Confira a conexão e tente de novo." onTentarNovamente={() => setTrechos(null)} />;
  if (trechos === null) {
    return (
      <div aria-busy className="flex flex-col gap-2.5">
        <span className="sr-only">Carregando a transcrição…</span>
        {[70, 92, 60, 84].map((w) => (
          <Esqueleto key={w} className="h-4 rounded" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex max-w-[760px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <CampoBusca rotulo="Buscar na transcrição" placeholder="Buscar na transcrição..." value={termo} onChange={(e) => setTermo(e.target.value)} classNameMoldura="w-full max-w-[340px]" maxLength={80} />
        <p className="m-0 text-xs text-muted" role="status">
          {buscando ? (achados.length ? `${achados.length} ${achados.length === 1 ? "trecho encontrado" : "trechos encontrados"}` : "Nada encontrado") : "Clique num trecho para ir ao ponto do vídeo"}
        </p>
      </div>
      {achados.length > 0 && (
        <ol ref={lista} aria-label="Trechos da transcrição" className="relative m-0 max-h-[420px] list-none overflow-y-auto rounded-xl border border-border p-1.5">
          {achados.map((i) => {
            const t = itens[i];
            const agora = i === atual;
            return (
              <li key={i} aria-current={agora || undefined}>
                <button
                  type="button"
                  onClick={() => onIrPara(t.inicio)}
                  className={cn(
                    "grid w-full cursor-pointer grid-cols-[52px_minmax(0,1fr)] items-baseline gap-2 rounded-lg px-2.5 py-2 text-left text-[15px] leading-[1.55] transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent",
                    agora && "bg-accent-soft hover:bg-accent-soft",
                  )}
                >
                  <span className={cn("text-xs font-semibold tabular-nums text-muted", agora && "text-accent")}>{formatarTempo(t.inicio)}</span>
                  <span className="whitespace-pre-line">
                    {partesComDestaque(t.texto, termo).map((p, k) =>
                      p.destaque ? (
                        <mark key={k} className="rounded-sm bg-accent/25 text-text">
                          {p.texto}
                        </mark>
                      ) : (
                        p.texto
                      ),
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
