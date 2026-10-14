import Link from "next/link";
import { AlertTriangle, CalendarClock, Hourglass, Lock, Video } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EspacoImagem } from "@/components/ui/espaco-imagem";
import type { AvisoAula, IconeAviso } from "./textos";

const ICONES: Record<IconeAviso, typeof Lock> = { cadeado: Lock, calendario: CalendarClock, ampulheta: Hourglass, video: Video, alerta: AlertTriangle };

/**
 * No lugar do vídeo (16:9, mesmo raio) quando a aula não toca: sem acesso (matrícula, liberação,
 * pré-requisito), vídeo processando, sem vídeo ou com falha. Sempre escuro, como o player.
 */
export function QuadroAviso({ aviso, poster }: { aviso: AvisoAula; poster?: string | null }) {
  const Icone = ICONES[aviso.icone];
  return (
    <div data-theme="dark" className="relative grid aspect-video w-full place-items-center overflow-hidden rounded-2xl bg-black text-fixo-text max-desk:aspect-auto max-desk:min-h-[240px]">
      {poster && <EspacoImagem src={poster} alt="" prioritaria sizes="(min-width: 900px) 900px, 100vw" className="bg-transparent opacity-25 blur-[2px]" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/40" aria-hidden />
      <div className="relative flex max-w-md flex-col items-center gap-3 px-6 py-8 text-center">
        <span aria-hidden className="grid size-12 place-items-center rounded-full bg-fixo-accent/15 text-fixo-accent">
          <Icone className="size-[22px]" />
        </span>
        <h2 className="m-0 font-sans text-lg font-extrabold tracking-normal desk:text-xl">{aviso.titulo}</h2>
        <p className="m-0 text-sm leading-relaxed text-fixo-muted">{aviso.descricao}</p>
        {aviso.acao && (
          <Link href={aviso.acao.href} className={buttonVariants({ variant: "heroPrimario", size: "42", className: "mt-1" })}>
            {aviso.acao.rotulo}
          </Link>
        )}
      </div>
    </div>
  );
}
