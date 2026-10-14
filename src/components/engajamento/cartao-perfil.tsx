import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Cartao } from "@/components/ui/cartao";
import { Estatistica } from "@/components/ui/estatistica";
import { cn } from "@/lib/utils";

export interface EstatisticaPerfil {
  valor: ReactNode;
  rotulo: string;
  tom?: "padrao" | "accent";
}

export interface CartaoPerfilProps {
  nome: string;
  avatarUrl?: string;
  /** "mai/2026". */
  membroDesde: string;
  /** 3 numa linha; 4 (com os pontos da gamificação) em 2 × 2. */
  estatisticas: EstatisticaPerfil[];
  /** Botão "Alterar foto" (ou outra ação) abaixo dos números; sem ele, nada aparece. */
  acaoFoto?: ReactNode;
}

export function CartaoPerfil({ nome, avatarUrl, membroDesde, estatisticas, acaoFoto }: CartaoPerfilProps) {
  return (
    <Cartao como="section" raio={18} padding={24} className="flex flex-col items-center gap-3.5 text-center">
      <Avatar nome={nome} src={avatarUrl} tamanho={96} tom="accent" borda />
      <div>
        <div className="text-xl font-extrabold">{nome}</div>
        <div className="text-[13px] text-muted">Membro desde {membroDesde}</div>
      </div>
      <div className={cn("mt-1.5 grid w-full gap-2", estatisticas.length === 4 ? "grid-cols-2" : "grid-cols-3")}>
        {estatisticas.map((e) => (
          <Estatistica key={e.rotulo} variante="compacta" {...e} />
        ))}
      </div>
      {acaoFoto}
    </Cartao>
  );
}
