"use client";

import { useRef } from "react";
import { CampoBusca } from "@/components/ui/campo-busca";
import { Selecao } from "@/components/ui/selecao";

const SITUACOES = [
  { valor: "", rotulo: "Todos os cursos" },
  { valor: "andamento", rotulo: "Em andamento" },
  { valor: "nao-iniciados", rotulo: "Não iniciados" },
  { valor: "concluidos", rotulo: "Concluídos" },
] as const;

export interface FiltrosContinuarProps {
  aba: string;
  busca: string;
  situacao: string;
  /** A situação só filtra cursos (aba Conteúdos). */
  comSituacao: boolean;
}

/** Busca + situação por GET (a URL guarda o filtro; Enter busca, trocar a situação aplica na hora). */
export function FiltrosContinuar({ aba, busca, situacao, comSituacao }: FiltrosContinuarProps) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} method="get" role="search" className="flex w-full flex-wrap gap-2 pb-2 desk:w-auto">
      {aba !== "conteudos" && <input type="hidden" name="aba" value={aba} />}
      <CampoBusca name="q" defaultValue={busca} rotulo="Pesquisar conteúdo" placeholder="Pesquisar conteúdo..." fundo="surface" classNameMoldura="min-w-0 flex-1 desk:w-[220px] desk:flex-none" />
      {comSituacao && (
        <Selecao
          name="situacao"
          rotulo="Situação"
          rotuloOculto
          tamanho="36"
          fundo="surface"
          defaultValue={situacao}
          opcoes={SITUACOES}
          onChange={() => form.current?.requestSubmit()}
          classNameMoldura="w-[170px]"
        />
      )}
    </form>
  );
}
