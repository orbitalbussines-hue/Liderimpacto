import { Cartao } from "@/components/ui/cartao";
import { Esqueleto } from "@/components/ui/esqueleto";

/** Esqueletos de cada bloco do painel (mesmo tamanho do conteúdo: a página não pula ao carregar). */

export function EsqueletoKpis() {
  return (
    <div aria-busy className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
      <span className="sr-only">Carregando indicadores...</span>
      {[0, 1, 2, 3].map((i) => (
        <Cartao key={i} className="flex flex-col gap-3">
          <Esqueleto className="h-3 w-24" />
          <Esqueleto className="h-8 w-16" />
          <Esqueleto className="h-3 w-40" />
        </Cartao>
      ))}
    </div>
  );
}

export function EsqueletoCartao({ titulo, linhas = 4, grafico = false }: { titulo: string; linhas?: number; grafico?: boolean }) {
  return (
    <Cartao aria-busy className="flex flex-col gap-4">
      <span className="sr-only">Carregando {titulo}...</span>
      <Esqueleto className="h-4 w-48" />
      {grafico ? (
        <Esqueleto className="h-[180px] w-full rounded-lg" />
      ) : (
        Array.from({ length: linhas }, (_, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <Esqueleto className="size-[30px] shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Esqueleto className="h-3 w-3/4" />
              <Esqueleto className="h-2.5 w-1/3" />
            </div>
          </div>
        ))
      )}
    </Cartao>
  );
}
