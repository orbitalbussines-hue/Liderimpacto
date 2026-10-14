import { Button } from "@/components/ui/button";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";

export interface CartaoEncontroAoVivoProps {
  dia: string;
  /** "SET". */
  mes: string;
  titulo: string;
  /** "Terça · 20h · Zoom". */
  quando: string;
}

/** Próximo encontro ao vivo: data em bloco accent-soft. */
export function CartaoEncontroAoVivo({ dia, mes, titulo, quando }: CartaoEncontroAoVivoProps) {
  return (
    <Cartao como="section" padding={18} className="flex flex-col gap-2.5">
      <CartaoTitulo>Próximo encontro ao vivo</CartaoTitulo>
      <div className="flex items-center gap-3">
        <div
          aria-hidden
          className="flex h-14 w-[52px] shrink-0 flex-col items-center justify-center rounded-[10px] bg-accent-soft leading-none font-extrabold text-accent"
        >
          <span className="text-xl">{dia}</span>
          <span className="text-[10px] tracking-[.1em] uppercase">{mes}</span>
        </div>
        <div>
          <div className="text-sm font-bold">{titulo}</div>
          <div className="text-xs text-muted">{quando}</div>
        </div>
      </div>
      <Button variant="contorno">Adicionar ao calendário</Button>
    </Cartao>
  );
}
