import { Cartao } from "@/components/ui/cartao";
import { Esqueleto } from "@/components/ui/esqueleto";

/** Esqueleto das listas de Matrículas enquanto a consulta roda (fallback do Suspense). */
export function CarregandoLista() {
  return (
    <Cartao padding={0} como="section" aria-busy="true">
      <span className="sr-only">Carregando...</span>
      <div className="flex flex-col gap-2 px-5 py-[18px]">
        <Esqueleto className="h-4 w-40" />
        <Esqueleto className="h-3 w-64" />
      </div>
      <div className="flex gap-4 border-b border-border px-5 pb-2.5">
        {[90, 80, 150, 90, 120].map((w, i) => (
          <Esqueleto key={i} className="h-3.5" style={{ width: w }} />
        ))}
      </div>
      <div className="px-5 py-3.5">
        <Esqueleto className="h-9 w-full max-w-md" />
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-t border-border px-5 py-3">
          <Esqueleto className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Esqueleto className="h-3 w-1/3" />
            <Esqueleto className="h-2.5 w-1/4" />
          </div>
          <Esqueleto className="hidden h-3 w-24 sm:block" />
        </div>
      ))}
    </Cartao>
  );
}
