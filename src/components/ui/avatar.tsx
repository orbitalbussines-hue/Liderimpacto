import Image from "next/image";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const avatarVariants = cva(
  "relative inline-grid shrink-0 place-items-center overflow-hidden leading-none font-extrabold select-none",
  {
    variants: {
      tamanho: {
        28: "size-7 text-[10px]",
        30: "size-[30px] text-[10px]",
        32: "size-8 text-[11px]",
        36: "size-9 text-xs",
        40: "size-10 text-xs",
        56: "size-14 text-base",
        96: "size-24 text-[28px]",
      },
      forma: { circulo: "rounded-full", quadrado: "rounded-md" },
      tom: {
        /** Membros, comentarios, atividade: surface-2. */
        neutro: "bg-surface-2 font-bold text-text",
        /** Usuario logado (compositor, sidebar, perfil): accent-soft. */
        accent: "bg-accent-soft text-accent",
        /** Avatar do header do aluno: gradiente accent -> accent escuro. */
        dourado: "bg-linear-135 from-accent to-accent-escuro text-accent-ink",
      },
      borda: { true: "border-2 border-accent", false: "" },
    },
    defaultVariants: { tamanho: 40, forma: "circulo", tom: "neutro", borda: false },
  }
);

export interface AvatarProps extends VariantProps<typeof avatarVariants> {
  /** Nome completo: gera as iniciais e o texto alternativo. */
  nome: string;
  /** Foto. Sem ela, mostra as iniciais. URL remota exige `images.remotePatterns` no next.config. */
  src?: string | null;
  className?: string;
}

/** "Valmer Albuquerque" -> "VA" (duas primeiras palavras). */
export function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
}

const PIXELS = { 28: 28, 30: 30, 32: 32, 36: 36, 40: 40, 56: 56, 96: 96 } as const;

export function Avatar({ nome, src, tamanho, forma, tom, borda, className }: AvatarProps) {
  const px = PIXELS[tamanho ?? 40];
  return (
    <span className={cn(avatarVariants({ tamanho, forma, tom, borda }), className)}>
      {src ? (
        <Image src={src} alt={nome} fill sizes={`${px}px`} className="object-cover" />
      ) : (
        <>
          <span aria-hidden>{iniciais(nome)}</span>
          <span className="sr-only">{nome}</span>
        </>
      )}
    </span>
  );
}
