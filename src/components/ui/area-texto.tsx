import { useId, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { CampoMoldura, idsDescricao, type CampoMolduraProps } from "./campo-moldura";
import { controleVariants } from "./campo";

export interface AreaTextoProps
  extends ComponentProps<"textarea">,
    Pick<CampoMolduraProps, "rotulo" | "rotuloOculto" | "estiloRotulo" | "ajuda"> {
  erro?: string;
  fundo?: "bg" | "surface";
  classNameMoldura?: string;
}

/** Texto longo (descricao do destaque no construtor). Mesmo visual do Campo, altura livre. */
export function AreaTexto({
  id,
  rotulo,
  rotuloOculto,
  estiloRotulo,
  ajuda,
  erro,
  fundo,
  rows = 4,
  className,
  classNameMoldura,
  ...props
}: AreaTextoProps) {
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
      <textarea
        id={idCampo}
        rows={rows}
        aria-invalid={erro ? true : undefined}
        aria-describedby={idsDescricao(idCampo, ajuda, erro)}
        className={cn(
          controleVariants({ tamanho: "44", fundo }),
          "h-auto resize-y px-3 py-2.5 leading-normal",
          className
        )}
        {...props}
      />
    </CampoMoldura>
  );
}
