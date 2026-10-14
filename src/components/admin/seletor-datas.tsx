"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ATALHOS, DIAS_DA_SEMANA, MAX_DIAS, atalhoDoIntervalo, dataCurta, dataPorExtenso, deslocarMes, diasEntre, gradeDoMes, intervaloDoAtalho,
  textoDoIntervalo, tituloDoMes,
} from "@/lib/painel/periodo";
import { cn } from "@/lib/utils";

type Mes = { ano: number; mes: number };
const mesDe = (d: string): Mes => ({ ano: Number(d.slice(0, 4)), mes: Number(d.slice(5, 7)) });
const chaveMes = (m: Mes) => m.ano * 12 + m.mes;

export interface SeletorDatasProps {
  /** Intervalo aplicado (`?de=&ate=`). Nulo = sem filtro de período (o gatilho mostra `rotuloVazio`). */
  valor: { de: string; ate: string } | null;
  /** Hoje em Brasília ("AAAA-MM-DD"): dias depois dele ficam desabilitados. Vem do servidor. */
  hoje: string;
  /** Rota da tela; "Atualizar" navega para `<caminho>?<manter>&de=&ate=`. */
  caminho: string;
  /** Outros filtros da URL que a navegação preserva (ex.: `{ aba, curso }`). */
  manter?: Record<string, string | null | undefined>;
  rotuloVazio?: string;
  className?: string;
}

/**
 * Seletor de período com calendário: atalhos + dois meses (um no celular, atalhos em chips
 * roláveis). Clicar em atalho ou em dias só muda o RASCUNHO; "Atualizar" navega com a URL nova e
 * fecha; Cancelar, Esc e clique fora fecham sem aplicar. Regras de data em `src/lib/painel/periodo.ts`.
 */
export function SeletorDatas({ valor, hoje, caminho, manter = {}, rotuloVazio = "Todo o período", className }: SeletorDatasProps) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [de, setDe] = useState<string | null>(null);
  const [ate, setAte] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  // Mês da DIREITA (o único visível no celular); no desktop o anterior aparece à esquerda.
  const [mes, setMes] = useState<Mes>(mesDe(hoje));

  const abrir = (sim: boolean) => {
    if (sim) {
      setDe(valor?.de ?? null);
      setAte(valor?.ate ?? null);
      setSobre(null);
      setMes(mesDe(valor?.ate ?? hoje));
    }
    setAberto(sim);
  };

  const escolhendoFim = de !== null && ate === null;
  const desabilitado = (d: string) => d > hoje || (escolhendoFim && Math.abs(diasEntre(de, d)) >= MAX_DIAS);

  function clicarDia(d: string) {
    if (!escolhendoFim) {
      setDe(d);
      setAte(null);
    } else if (d < de) {
      setAte(de);
      setDe(d);
    } else setAte(d);
  }

  function aplicar() {
    if (!de || !ate) return;
    const extras = Object.entries(manter).filter((e): e is [string, string] => !!e[1]);
    router.push(`${caminho}?${new URLSearchParams([...extras, ["de", de], ["ate", ate]])}`, { scroll: false });
    setAberto(false);
  }

  // Faixa mostrada: o intervalo completo ou, escolhendo o fim, a prévia até o dia sob o mouse/foco.
  const fim = ate ?? (escolhendoFim && sobre && !desabilitado(sobre) ? sobre : de);
  const [ini, fin] = de && fim ? (fim < de ? [fim, de] : [de, fim]) : [null, null];
  const atalho = de && ate ? atalhoDoIntervalo(de, ate, hoje) : null;
  const podeAvancar = chaveMes(mes) < chaveMes(mesDe(hoje));

  const rotulo = valor ? textoDoIntervalo(valor.de, valor.ate) : rotuloVazio;
  const rodape = de && ate ? textoDoIntervalo(de, ate) : de ? `${dataCurta(de)} a …` : "Escolha o primeiro dia";

  return (
    <Popover.Root open={aberto} onOpenChange={abrir}>
      <Popover.Trigger
        render={<Button variant="secundario" size="36" aria-label={`Período: ${rotulo}`} className={cn("min-h-11 desk:min-h-0", className)} />}
      >
        <CalendarDays className="size-4 text-muted" aria-hidden />
        <span className="tabular-nums">{rotulo}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={8} className="z-50 outline-none">
          <Popover.Popup
            aria-label="Escolher período"
            className="max-h-[var(--available-height)] w-[min(calc(100vw-16px),360px)] overflow-y-auto rounded-xl border border-border bg-surface text-text shadow-card outline-none transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 desk:w-auto"
          >
            <div className="flex flex-col desk:flex-row">
              <ul
                aria-label="Atalhos"
                className="m-0 flex list-none gap-2 overflow-x-auto border-b border-border p-3 scrollbar-oculta desk:w-[172px] desk:shrink-0 desk:flex-col desk:gap-0.5 desk:overflow-visible desk:border-r desk:border-b-0 desk:p-2"
              >
                {ATALHOS.map((a) => {
                  const ativo = atalho === a.id;
                  return (
                    <li key={a.id} className="shrink-0">
                      <button
                        type="button"
                        aria-pressed={ativo}
                        // No celular os atalhos rolam na horizontal: traz o ativo para a vista.
                        ref={ativo ? (el) => el?.scrollIntoView?.({ block: "nearest", inline: "nearest" }) : undefined}
                        onClick={() => {
                          const i = intervaloDoAtalho(a.id, hoje);
                          setDe(i.de);
                          setAte(i.ate);
                          setMes(mesDe(i.ate));
                        }}
                        className={cn(
                          "h-9 cursor-pointer rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap transition-colors duration-150 desk:w-full desk:rounded-md desk:border-transparent desk:text-left",
                          ativo ? "border-transparent bg-accent-soft text-accent" : "border-border text-muted hover:bg-surface-2 hover:text-text"
                        )}
                      >
                        {a.rotulo}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex gap-6 p-3 desk:p-4" onMouseLeave={() => setSobre(null)}>
                {[deslocarMes(mes, -1), mes].map((m, i) => (
                  <MesDoCalendario
                    key={chaveMes(m)}
                    mes={m}
                    direita={i === 1}
                    podeAvancar={podeAvancar}
                    navegar={(n) => setMes(deslocarMes(mes, n))}
                    ini={ini}
                    fin={fin}
                    hoje={hoje}
                    desabilitado={desabilitado}
                    aoClicar={clicarDia}
                    aoSobre={setSobre}
                  />
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border p-3 desk:px-4">
              <span aria-live="polite" className="basis-full text-[13px] font-semibold tabular-nums desk:basis-auto">
                {rodape}
              </span>
              <div className="ml-auto flex gap-2">
                <Button variant="fantasma" size="36" className="min-h-11 desk:min-h-0" onClick={() => setAberto(false)}>
                  Cancelar
                </Button>
                <Button size="36" className="min-h-11 desk:min-h-0" disabled={!de || !ate} onClick={aplicar}>
                  Atualizar
                </Button>
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface MesProps {
  mes: Mes;
  /** O mês da direita: o único no celular, então leva as duas setas (a ‹ some no desktop). */
  direita: boolean;
  podeAvancar: boolean;
  navegar: (n: number) => void;
  ini: string | null;
  fin: string | null;
  hoje: string;
  desabilitado: (d: string) => boolean;
  aoClicar: (d: string) => void;
  aoSobre: (d: string) => void;
}

const SETA = "grid size-11 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:cursor-default disabled:opacity-40 desk:size-8";

function MesDoCalendario({ mes, direita, podeAvancar, navegar, ini, fin, hoje, desabilitado, aoClicar, aoSobre }: MesProps) {
  const titulo = tituloDoMes(mes);
  return (
    <div role="group" aria-label={titulo} className={cn("min-w-0 flex-1", !direita && "hidden desk:block")}>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Mês anterior" onClick={() => navegar(-1)} className={cn(SETA, direita && "desk:invisible")}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <span className="text-sm font-bold">{titulo}</span>
        {direita ? (
          <button type="button" aria-label="Próximo mês" disabled={!podeAvancar} onClick={() => navegar(1)} className={SETA}>
            <ChevronRight className="size-4" aria-hidden />
          </button>
        ) : (
          <span aria-hidden className="size-11 desk:size-8" />
        )}
      </div>
      <div className="grid grid-cols-7 desk:grid-cols-[repeat(7,2.5rem)]">
        {DIAS_DA_SEMANA.map((s) => (
          <span key={s} aria-hidden className="pb-1.5 text-center text-[10px] font-semibold tracking-wide text-muted">
            {s}
          </span>
        ))}
        {gradeDoMes(mes.ano, mes.mes).map((d, i) => {
          if (!d) return <span key={`v${i}`} aria-hidden />;
          const ponta = d === ini || d === fin;
          const dentro = !!ini && !!fin && d >= ini && d <= fin;
          const fora = desabilitado(d);
          return (
            <div key={d} className="relative h-11 desk:h-10">
              {dentro && ini !== fin && (
                <span
                  aria-hidden
                  className={cn("absolute inset-y-0 bg-accent-soft", d === ini ? "right-0 left-1/2" : d === fin ? "right-1/2 left-0" : "inset-x-0")}
                />
              )}
              <button
                type="button"
                aria-label={`${dataPorExtenso(d)}${d === ini ? ", início do período" : ""}${d === fin ? ", fim do período" : ""}`}
                aria-pressed={dentro}
                aria-current={d === hoje ? "date" : undefined}
                disabled={fora}
                onClick={() => aoClicar(d)}
                onMouseEnter={() => aoSobre(d)}
                onFocus={() => aoSobre(d)}
                className={cn(
                  "relative grid size-full cursor-pointer place-items-center rounded-full text-[13px] tabular-nums transition-colors duration-100 focus-visible:z-10",
                  ponta ? "bg-accent font-bold text-accent-ink" : dentro ? "font-semibold text-text hover:bg-accent-soft" : "hover:bg-surface-2",
                  !ponta && d === hoje && "font-bold text-accent",
                  fora && "cursor-default text-muted/40 hover:bg-transparent"
                )}
              >
                {Number(d.slice(8, 10))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
