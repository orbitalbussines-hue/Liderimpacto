import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Cartao } from "@/components/ui/cartao";
import { Estatistica } from "@/components/ui/estatistica";

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
  estatisticas: EstatisticaPerfil[];
  /** Substitui o botão "Alterar foto" (visual) quando houver a ação real. */
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
      <div className="mt-1.5 grid w-full grid-cols-3 gap-2">
        {estatisticas.map((e) => (
          <Estatistica key={e.rotulo} variante="compacta" {...e} />
        ))}
      </div>
      {acaoFoto ?? (
        <Button variant="contorno" larguraTotal>
          Alterar foto
        </Button>
      )}
    </Cartao>
  );
}
