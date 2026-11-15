import Image from "next/image";
import { TextoComLinks } from "@/components/comunidade/texto-com-links";
import type { BlocoConteudo } from "@/lib/catalogo/conteudo-aula";
import { urlDoPlayer } from "@/lib/paginas/config";

export interface BlocosAulaProps {
  blocos: BlocoConteudo[];
  /** URL assinada por id de arquivo (só as imagens que o servidor achou deste criador). */
  imagens: Record<string, string | null>;
}

/**
 * Conteúdo da aula em blocos (RN-275), sem estado: texto como TEXTO (o React escapa; só http(s)
 * vira link), imagem na proporção natural com link para o tamanho cheio, vídeo no player de
 * domínio fixo. NUNCA `dangerouslySetInnerHTML`. Imagem sem URL (sumiu) = o bloco não aparece.
 */
export function BlocosAula({ blocos, imagens }: BlocosAulaProps) {
  return (
    <div className="flex max-w-[760px] min-w-0 flex-col gap-5 text-[15px] leading-[1.65]">
      {blocos.map((b, i) => {
        if (b.tipo === "TEXTO")
          return (
            <div key={i} className="flex flex-col gap-3.5">
              {b.texto
                .split(/\n\s*\n/)
                .filter((p) => p.trim())
                .map((p, j) => (
                  <TextoComLinks key={j} texto={p.trim()} />
                ))}
            </div>
          );
        if (b.tipo === "IMAGEM") {
          const url = imagens[b.arquivoId];
          if (!url) return null;
          return (
            <figure key={i} className="m-0">
              <a href={url} target="_blank" rel="noopener noreferrer" className="block" aria-label={`Abrir em tamanho cheio: ${b.alt}`}>
                <Image src={url} alt={b.alt} width={1600} height={1200} sizes="(min-width: 1100px) 760px, 100vw" className="h-auto w-full rounded-2xl border border-border bg-surface" />
              </a>
              {b.legenda && <figcaption className="mt-2 text-sm text-muted">{b.legenda}</figcaption>}
            </figure>
          );
        }
        const n = blocos.slice(0, i + 1).filter((x) => x.tipo === "VIDEO").length;
        return (
          <div key={i} className="overflow-hidden rounded-2xl border border-border bg-surface">
            <iframe
              src={urlDoPlayer(b)}
              title={`Vídeo ${n} da aula`}
              loading="lazy"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
              className="aspect-video w-full border-0"
            />
          </div>
        );
      })}
    </div>
  );
}
