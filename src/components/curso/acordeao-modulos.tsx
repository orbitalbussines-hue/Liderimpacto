"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { Cartao } from "@/components/ui/cartao";
import { cn } from "@/lib/utils";
import { ItemAula } from "./item-aula";
import type { EstadoModulo, ModuloCurso } from "./tipos";

const ROTULO: Record<EstadoModulo, string> = {
  concluido: "Concluído",
  andamento: "Em andamento",
  bloqueado: "Bloqueado",
};
const COR_ESTADO: Record<EstadoModulo, string> = {
  concluido: "text-ok",
  andamento: "text-accent",
  bloqueado: "text-muted",
};
const COR_NUMERO: Record<EstadoModulo, string> = {
  concluido: "bg-accent text-accent-ink",
  andamento: "bg-accent-soft text-accent",
  bloqueado: "bg-surface-2 text-muted",
};

function CabecalhoModulo({ modulo, aberto }: { modulo: ModuloCurso; aberto?: boolean }) {
  return (
    <>
      <span
        aria-hidden
        className={cn("grid size-[34px] shrink-0 place-items-center rounded-[10px] text-[13px] font-extrabold", COR_NUMERO[modulo.estado])}
      >
        {modulo.numero}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[15px] font-bold">{modulo.titulo}</span>
        <span className="block text-xs text-muted">
          {modulo.totalAulas} {modulo.totalAulas === 1 ? "aula" : "aulas"} · {modulo.duracao}
          {/* Celular: o estado desce para a linha de baixo e o título fica com a largura toda. */}
          <span className={cn("font-bold desk:hidden", COR_ESTADO[modulo.estado])}> · {ROTULO[modulo.estado]}</span>
        </span>
      </span>
      <span className={cn("hidden items-center gap-1 text-xs font-bold desk:flex", COR_ESTADO[modulo.estado])}>
        {modulo.estado === "bloqueado" && <Lock aria-hidden className="size-3" />}
        {ROTULO[modulo.estado]}
      </span>
      {aberto !== undefined && (
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted transition-transform", aberto && "rotate-180")} />
      )}
    </>
  );
}

/** Último pedido de módulo (`#modulo-<id>`); `vez` conta os pedidos, para repetir o mesmo hash. */
interface Pedido {
  hash: string;
  vez: number;
}

/**
 * Módulo pedido pela URL (RN-273), por três caminhos só: o hash no carregamento (efeito de
 * montagem, depois da hidratação), `hashchange` e o clique numa capinha desta página (o Link do
 * Next troca o hash por pushState, sem `hashchange`). A renderização nunca lê `location`: um
 * hash trocado por pushState não vira pedido "pendente" num refresh qualquer.
 */
function useModuloPedido(): Pedido {
  const [pedido, setPedido] = useState<Pedido>({ hash: "", vez: 0 });
  useEffect(() => {
    const pedir = (hash: string) => {
      if (hash.startsWith("#modulo-")) setPedido((p) => ({ hash, vez: p.vez + 1 }));
    };
    const aoMudarHash = () => pedir(window.location.hash);
    const aoClicar = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(a instanceof HTMLAnchorElement)) return;
      const u = new URL(a.href, window.location.href);
      if (u.pathname === window.location.pathname) pedir(u.hash);
    };
    aoMudarHash(); // hash do carregamento
    window.addEventListener("hashchange", aoMudarHash);
    document.addEventListener("click", aoClicar);
    return () => {
      window.removeEventListener("hashchange", aoMudarHash);
      document.removeEventListener("click", aoClicar);
    };
  }, []);
  return pedido;
}

function Modulo({ modulo, pedido }: { modulo: ModuloCurso; pedido: Pedido }) {
  const [aberto, setAberto] = useState(modulo.estado === "andamento");
  const [rolar, setRolar] = useState(0);
  const [vez, setVez] = useState(pedido.vez);
  // Pedido novo apontando para este módulo: abre, rola até ele e leva o foco.
  if (vez !== pedido.vez) {
    setVez(pedido.vez);
    if (pedido.hash === `#modulo-${modulo.id}`) {
      setAberto(true);
      setRolar((n) => n + 1);
    }
  }
  const ref = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!rolar) return;
    const suave = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView?.({ block: "start", behavior: suave ? "smooth" : "auto" });
    // Foco no módulo (teclado/leitor de tela): sem isto o próximo Tab volta para a capinha lá em cima.
    (botao.current ?? ref.current)?.focus({ preventScroll: true });
  }, [rolar]);
  const idLista = `modulo-${modulo.id}-aulas`;
  return (
    <Cartao ref={ref} id={`modulo-${modulo.id}`} tabIndex={-1} padding={0} raio={14} className="scroll-mt-24">
      {modulo.aulas.length === 0 ? (
        <div className="flex items-center gap-3.5 px-[18px] py-4">
          <CabecalhoModulo modulo={modulo} />
        </div>
      ) : (
        <>
          <button
            ref={botao}
            type="button"
            aria-expanded={aberto}
            aria-controls={idLista}
            onClick={() => setAberto((v) => !v)}
            className="flex w-full cursor-pointer items-center gap-3.5 px-[18px] py-4 hover:bg-surface-2"
          >
            <CabecalhoModulo modulo={modulo} aberto={aberto} />
          </button>
          <div id={idLista} hidden={!aberto} className="flex-col">
            {aberto && modulo.aulas.map((aula) => <ItemAula key={aula.id} aula={aula} />)}
          </div>
        </>
      )}
    </Cartao>
  );
}

/** Acordeão de módulos da página do curso. O módulo em andamento nasce aberto; `#modulo-<id>` abre aquele. */
export function AcordeaoModulos({ modulos }: { modulos: ModuloCurso[] }) {
  const pedido = useModuloPedido();
  return (
    <div className="flex flex-col gap-2.5">
      {modulos.map((modulo) => (
        <Modulo key={modulo.id} modulo={modulo} pedido={pedido} />
      ))}
    </div>
  );
}
