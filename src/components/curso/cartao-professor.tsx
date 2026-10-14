import { Avatar } from "@/components/ui/avatar";
import { Cartao } from "@/components/ui/cartao";

export interface CartaoProfessorProps {
  nome: string;
  fotoUrl?: string;
  rotulo?: string;
}

export function CartaoProfessor({ nome, fotoUrl, rotulo = "Professor" }: CartaoProfessorProps) {
  return (
    <Cartao como="section" className="flex items-center gap-3.5">
      <Avatar nome={nome} src={fotoUrl} tamanho={56} />
      <div>
        <div className="text-xs text-muted">{rotulo}</div>
        <div className="text-base font-extrabold">{nome}</div>
      </div>
    </Cartao>
  );
}
