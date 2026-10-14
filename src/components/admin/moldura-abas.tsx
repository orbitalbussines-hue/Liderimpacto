import type { ReactNode } from "react";
import { Abas } from "@/components/ui/abas";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao } from "@/components/ui/cartao";

export interface MolduraAbasProps {
  titulo: string;
  meta?: ReactNode;
  acoes?: ReactNode;
  /** Abas em LINK (cada uma é uma rota). */
  abas: readonly { rotulo: string; href: string }[];
  ativa: string;
  children: ReactNode;
}

/**
 * O cabeçalho e as abas do `PaginaTabela`, com conteúdo livre embaixo: para a aba de uma seção que
 * não é tabela (formulário, teste, gráfico) ficar com a mesma cara das abas que são.
 */
export function MolduraAbas({ titulo, meta, acoes, abas, ativa, children }: MolduraAbasProps) {
  return (
    <Cartao padding={0} como="section" aria-label={titulo}>
      <CabecalhoPagina variante="adminTabela" titulo={titulo} meta={meta} acoes={acoes} className="px-5 py-[18px]" />
      <div className="scrollbar-oculta flex overflow-x-auto border-b border-border px-5">
        <Abas
          tamanho="admin"
          itens={abas.map((a) => ({ valor: a.rotulo, rotulo: a.rotulo, href: a.href }))}
          ativo={ativa}
          aria-label={`Seções de ${titulo}`}
          className="overflow-visible border-b-0"
        />
      </div>
      <div className="p-5">{children}</div>
    </Cartao>
  );
}
