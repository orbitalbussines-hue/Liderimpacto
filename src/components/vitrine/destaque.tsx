import Link from "next/link";
import { Megaphone, Play, Volume2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EspacoImagem } from "@/components/ui/espaco-imagem";
import { Selo } from "@/components/ui/selo";
import type { DestaqueConfig } from "./tipos";

export interface DestaqueProps extends DestaqueConfig {
  /** Mostra o botão de som (decorativo) no canto superior direito. */
  mostrarSom?: boolean;
}

/** Hero da vitrine: imagem de fundo, dois overlays, título serifado, meta, botões e avisos. */
export function Destaque({
  titulo,
  descricao,
  imagemUrl,
  badge,
  meta,
  botaoPrincipal,
  botaoSecundario,
  avisos,
  mostrarAvisos,
  mostrarSom = false,
}: DestaqueProps) {
  const temAvisos = mostrarAvisos && avisos && (avisos.novidade || avisos.ranking);
  return (
    <section className="relative flex min-h-[520px] overflow-hidden rounded-3xl bg-fixo-bg shadow-card desk:min-h-[600px]">
      <EspacoImagem src={imagemUrl} alt="" dica="Imagem de destaque do curso" sizes="100vw" prioritaria />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-linear-to-r from-fixo-bg/90 from-0% via-fixo-bg/45 via-50% to-fixo-bg/0 to-80%"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-linear-to-t from-fixo-bg/90 from-0% to-fixo-bg/0 to-55%"
      />
      {mostrarSom && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-5 right-[22px] grid size-[38px] place-items-center rounded-full bg-fixo-vidro text-fixo-text"
        >
          <Volume2 className="size-[17px]" />
        </span>
      )}
      <div className="relative z-10 flex w-full flex-wrap items-end justify-between gap-5 self-end p-[22px] desk:p-11">
        <div className="flex max-w-[700px] flex-col gap-3.5">
          <h1 className="m-0 font-serif text-[46px] leading-[.98] font-bold tracking-[-.02em] text-fixo-titulo uppercase desk:text-[84px]">
            {titulo}
          </h1>
          <div className="flex flex-wrap items-center gap-2.5 text-[15px] font-bold text-fixo-text">
            {meta.map((item, i) => (
              <span key={item} className="contents">
                {i > 0 && (
                  <span aria-hidden className="opacity-50">
                    •
                  </span>
                )}
                <span>{item}</span>
              </span>
            ))}
            {badge && (
              <Selo tom="fixo" forma="etiqueta" className="px-[7px] py-0.5 text-xs">
                {badge}
              </Selo>
            )}
          </div>
          <p className="m-0 max-w-[560px] text-[15px] leading-[1.45] text-fixo-text desk:text-lg">{descricao}</p>
          <div className="mt-1.5 flex flex-wrap gap-3">
            <Link href={botaoPrincipal.href} className={buttonVariants({ variant: "heroPrimario", size: "48", className: "gap-2.5" })}>
              <Play aria-hidden className="fill-current" />
              {botaoPrincipal.texto}
            </Link>
            <Link href={botaoSecundario.href} className={buttonVariants({ variant: "heroSecundario", size: "48" })}>
              {botaoSecundario.texto}
            </Link>
          </div>
        </div>
        {temAvisos && (
          <div className="hidden items-center gap-[26px] pb-1.5 text-xs font-bold text-fixo-text desk:flex">
            {avisos.novidade && (
              <span className="flex items-center gap-2">
                <Megaphone aria-hidden className="size-[18px] text-fixo-accent" />
                {avisos.novidade}
              </span>
            )}
            {avisos.ranking && (
              <span className="flex items-center gap-2">
                <Selo tom="fixo" forma="etiqueta" className="rounded px-[5px]">
                  {avisos.ranking.selo}
                </Selo>
                {avisos.ranking.texto}
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
