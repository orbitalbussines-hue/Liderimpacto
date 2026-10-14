import { Avatar } from "@/components/ui/avatar";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";

export interface MembroAtivo {
  nome: string;
  pontos?: number;
  src?: string | null;
  /** No lugar dos pontos (enquanto não há gamificação): "12 interações". */
  detalhe?: string;
}

export function CartaoMembrosAtivos({ membros }: { membros: MembroAtivo[] }) {
  return (
    <Cartao como="section" padding={18} className="flex flex-col gap-2.5">
      <CartaoTitulo>Membros ativos</CartaoTitulo>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {membros.map(({ nome, pontos, src, detalhe }) => (
          <li key={nome} className="flex items-center gap-2.5">
            <Avatar nome={nome} src={src} tamanho={30} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{nome}</span>
            {detalhe ? <span className="shrink-0 text-xs text-muted">{detalhe}</span> : pontos !== undefined && <span className="text-xs font-bold text-accent">{pontos} pts</span>}
          </li>
        ))}
      </ul>
    </Cartao>
  );
}
