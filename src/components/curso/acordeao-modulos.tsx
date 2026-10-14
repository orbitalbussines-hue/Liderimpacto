"use client";

import { useState } from "react";
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

function Modulo({ modulo }: { modulo: ModuloCurso }) {
  const [aberto, setAberto] = useState(modulo.estado === "andamento");
  const idLista = `modulo-${modulo.id}-aulas`;
  return (
    <Cartao padding={0} raio={14}>
      {modulo.aulas.length === 0 ? (
        <div className="flex items-center gap-3.5 px-[18px] py-4">
          <CabecalhoModulo modulo={modulo} />
        </div>
      ) : (
        <>
          <button
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

/** Acordeão de módulos da página do curso. O módulo em andamento nasce aberto. */
export function AcordeaoModulos({ modulos }: { modulos: ModuloCurso[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {modulos.map((modulo) => (
        <Modulo key={modulo.id} modulo={modulo} />
      ))}
    </div>
  );
}
