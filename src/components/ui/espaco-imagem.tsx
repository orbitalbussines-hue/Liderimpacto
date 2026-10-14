import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const PROPORCAO = {
  "16/9": "aspect-video",
  "3/4": "aspect-[3/4]",
  "16/10": "aspect-[16/10]",
  "1.414": "aspect-[1.414]",
} as const;

export interface EspacoImagemProps {
  src?: string | null;
  /** Texto alternativo. Imagem decorativa: "". */
  alt: string;
  /** Texto do vazio ("Capa do curso"). Sem src, aparece centralizado sob o icone. */
  dica?: string;
  /** Sem proporcao, preenche o pai (absolute inset-0; o pai precisa de `relative` e tamanho). */
  proporcao?: keyof typeof PROPORCAO;
  /** Atributo `sizes` do next/image. Ex.: "(min-width: 900px) 280px, 210px". */
  sizes?: string;
  /** Imagem acima da dobra (hero): carrega cedo. */
  prioritaria?: boolean;
  className?: string;
}

/**
 * Substituto de producao do `image-slot` do prototipo. Com src: next/image
 * (fill + object-cover). Sem src: vazio surface-2 com icone e dica.
 * URL remota exige `images.remotePatterns` no next.config.
 */
export function EspacoImagem({
  src,
  alt,
  dica,
  proporcao,
  sizes = "100vw",
  prioritaria = false,
  className,
}: EspacoImagemProps) {
  return (
    <div
      className={cn(
        "overflow-hidden bg-surface-2",
        proporcao ? cn("relative w-full", PROPORCAO[proporcao]) : "absolute inset-0",
        className
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          loading={prioritaria ? "eager" : undefined}
          fetchPriority={prioritaria ? "high" : undefined}
          className="object-cover"
        />
      ) : (
        <div
          role={alt ? "img" : undefined}
          aria-label={alt || undefined}
          className="absolute inset-0 grid place-content-center justify-items-center gap-1.5 p-2 text-center text-muted"
        >
          <ImageIcon className="size-5 opacity-70" aria-hidden />
          {dica && <span className="text-[11px] leading-tight font-medium" aria-hidden>{dica}</span>}
        </div>
      )}
    </div>
  );
}
