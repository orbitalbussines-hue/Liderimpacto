import { Esqueleto } from "@/components/ui/esqueleto";

/** Carregando a aula: o formato da tela 5 (vídeo 16:9, título, botões, abas | playlist). */
export function EsqueletoAula() {
  return (
    <div aria-busy className="mx-auto grid max-w-[1400px] items-start gap-6 desk:grid-cols-[minmax(0,1fr)_340px]">
      <span className="sr-only">Carregando a aula…</span>
      <div className="flex min-w-0 flex-col gap-[18px]">
        <Esqueleto className="aspect-video w-full rounded-2xl" />
        <div className="flex flex-col gap-2">
          <Esqueleto className="h-3 w-36" />
          <Esqueleto className="h-9 w-3/4 max-w-[560px]" />
        </div>
        <div className="flex max-w-[480px] gap-2.5">
          <Esqueleto className="h-[46px] flex-1 rounded-[9px]" />
          <Esqueleto className="h-[46px] flex-[1.3] rounded-[9px]" />
        </div>
        <Esqueleto className="h-12 w-full rounded-xl" />
        <Esqueleto className="h-24 w-full max-w-[760px]" />
      </div>
      <Esqueleto className="h-[520px] w-full rounded-2xl" />
    </div>
  );
}
