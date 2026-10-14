import { cn } from "@/lib/utils";

/**
 * Texto da legenda sobre o vídeo. Tamanho pela largura do PLAYER (`cqw`: o player é `@container`),
 * então cresce em tela cheia e não encolhe demais no celular. Sobe quando os controles aparecem.
 * Só texto (React escapa): nunca HTML da legenda.
 */
export function LegendaNaTela({ texto, elevada }: { texto: string; elevada: boolean }) {
  if (!texto) return null;
  return (
    <div
      aria-hidden
      data-testid="legenda-na-tela"
      className={cn(
        "pointer-events-none absolute inset-x-0 z-[5] flex justify-center px-[5%] transition-[bottom] duration-200 motion-reduce:transition-none",
        elevada ? "bottom-[76px] desk:bottom-[100px]" : "bottom-[6%]",
      )}
    >
      <p className="m-0 max-w-full rounded-md bg-black/75 px-[0.55em] py-[0.15em] text-center text-[clamp(14px,2.3cqw,40px)] leading-[1.4] font-semibold whitespace-pre-line text-white [text-wrap:balance] [box-decoration-break:clone]">
        {texto}
      </p>
    </div>
  );
}
