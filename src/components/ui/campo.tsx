import { useId, type ComponentProps, type ReactNode } from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { CampoMoldura, idsDescricao, type CampoMolduraProps } from "./campo-moldura";

/** Visual do controle de texto; AreaTexto reaproveita. */
export const controleVariants = cva(
  "w-full min-w-0 border border-border font-sans text-text transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-muted focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/25 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-warn aria-invalid:focus-visible:ring-warn/25",
  {
    variants: {
      tamanho: {
        "36": "h-9 rounded-md px-3 text-[13px]",
        "42": "h-[42px] rounded-lg px-3 text-sm font-medium",
        "44": "h-11 rounded-lg px-3.5 text-sm",
        "48": "h-12 rounded-lg px-3.5 text-sm",
      },
      fundo: { bg: "bg-bg", surface: "bg-surface" },
    },
    defaultVariants: { tamanho: "44", fundo: "bg" },
  }
);

export interface CampoProps
  extends Omit<ComponentProps<"input">, "size">,
    Pick<CampoMolduraProps, "rotulo" | "rotuloOculto" | "estiloRotulo" | "ajuda"> {
  /** Mensagem de erro: pinta a borda de warn, marca aria-invalid e entra no aria-describedby. */
  erro?: string;
  /** 36 busca/filtro · 42 construtor · 44 perfil (padrao) · 48 login. */
  tamanho?: "36" | "42" | "44" | "48";
  /** `bg` (perfil, construtor, busca) ou `surface` (login). */
  fundo?: "bg" | "surface";
  /** Icone a esquerda (ex.: <Search />). */
  icone?: ReactNode;
  /** Conteudo a direita dentro do campo (ex.: atalho ⌘K, botao mostrar senha). */
  sufixo?: ReactNode;
  /** Classe do wrapper (largura, grid). `className` vai no <input>. */
  classNameMoldura?: string;
}

/** Campo de texto com rotulo acima (perfil 44px, login 48px). */
export function Campo({
  id,
  rotulo,
  rotuloOculto,
  estiloRotulo,
  ajuda,
  erro,
  tamanho,
  fundo,
  icone,
  sufixo,
  className,
  classNameMoldura,
  ...props
}: CampoProps) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  return (
    <CampoMoldura
      id={idCampo}
      rotulo={rotulo}
      rotuloOculto={rotuloOculto}
      estiloRotulo={estiloRotulo}
      ajuda={ajuda}
      erro={erro}
      className={classNameMoldura}
    >
      <div className="relative flex items-center">
        {icone && (
          <span className="pointer-events-none absolute left-3 flex text-muted [&_svg:not([class*='size-'])]:size-4">
            {icone}
          </span>
        )}
        <input
          id={idCampo}
          aria-invalid={erro ? true : undefined}
          aria-describedby={idsDescricao(idCampo, ajuda, erro)}
          className={cn(controleVariants({ tamanho, fundo }), icone && "pl-9", sufixo && "pr-12", className)}
          {...props}
        />
        {sufixo && <span className="absolute right-2.5 flex items-center text-muted">{sufixo}</span>}
      </div>
    </CampoMoldura>
  );
}
