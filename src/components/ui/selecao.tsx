import { useId, type ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { controleVariants } from "./campo";
import { CampoMoldura, idsDescricao, type CampoMolduraProps } from "./campo-moldura";

export interface OpcaoSelecao {
  valor: string;
  rotulo: string;
  /** Agrupa no <optgroup> (ex.: módulo das aulas). */
  grupo?: string;
}

export interface SelecaoProps
  extends Omit<ComponentProps<"select">, "size" | "children">,
    Pick<CampoMolduraProps, "rotulo" | "rotuloOculto" | "estiloRotulo" | "ajuda"> {
  opcoes: readonly OpcaoSelecao[];
  /** Primeira opção vazia ("Nenhum"): valor "". */
  vazio?: string;
  erro?: string;
  tamanho?: "36" | "42" | "44" | "48";
  fundo?: "bg" | "surface";
  classNameMoldura?: string;
}

/**
 * Lista de escolha (professor, pré-requisito): <select> nativo com o visual do Campo. Nativo de
 * propósito: teclado, leitor de tela e celular já resolvidos pelo navegador.
 */
export function Selecao({
  id,
  rotulo,
  rotuloOculto,
  estiloRotulo,
  ajuda,
  erro,
  tamanho = "42",
  fundo,
  opcoes,
  vazio,
  className,
  classNameMoldura,
  ...props
}: SelecaoProps) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  const grupos = [...new Set(opcoes.map((o) => o.grupo ?? ""))];
  const item = (o: OpcaoSelecao) => (
    <option key={o.valor} value={o.valor}>
      {o.rotulo}
    </option>
  );
  return (
    <CampoMoldura id={idCampo} rotulo={rotulo} rotuloOculto={rotuloOculto} estiloRotulo={estiloRotulo} ajuda={ajuda} erro={erro} className={classNameMoldura}>
      <div className="relative flex items-center">
        <select
          id={idCampo}
          aria-invalid={erro ? true : undefined}
          aria-describedby={idsDescricao(idCampo, ajuda, erro)}
          className={cn(controleVariants({ tamanho, fundo }), "cursor-pointer appearance-none pr-9", className)}
          {...props}
        >
          {vazio !== undefined && <option value="">{vazio}</option>}
          {grupos.map((g) =>
            g ? (
              <optgroup key={g} label={g}>
                {opcoes.filter((o) => o.grupo === g).map(item)}
              </optgroup>
            ) : (
              opcoes.filter((o) => !o.grupo).map(item)
            )
          )}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 size-4 text-muted" aria-hidden />
      </div>
    </CampoMoldura>
  );
}
