import { Search } from "lucide-react";
import { Campo, type CampoProps } from "./campo";

export interface CampoBuscaProps
  extends Omit<CampoProps, "rotulo" | "rotuloOculto" | "tamanho" | "icone" | "type"> {
  /** Nome acessivel (rotulo escondido). Padrao: "Pesquisar". */
  rotulo?: string;
}

/** Busca 36px r8 com lupa (barras de filtro, sidebar). fundo `bg` (padrao) ou `surface`. */
export function CampoBusca({ rotulo = "Pesquisar", placeholder = "Pesquisar...", ...props }: CampoBuscaProps) {
  return (
    <Campo
      type="search"
      rotulo={rotulo}
      rotuloOculto
      tamanho="36"
      icone={<Search />}
      placeholder={placeholder}
      {...props}
    />
  );
}
