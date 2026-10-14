import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Cartao } from "@/components/ui/cartao";
import { EtapasTrilha } from "./etapas-trilha";

export interface CartaoTrilhaProps {
  tag: string;
  titulo: string;
  descricao: string;
  totalEtapas: number;
  etapasConcluidas: number;
  /** "9h 25". */
  duracao: string;
  href: string;
}

/** Cartão largo da tela Trilhas: o CTA muda com o progresso (Iniciar / Continuar / Rever). */
export function CartaoTrilha({ tag, titulo, descricao, totalEtapas, etapasConcluidas, duracao, href }: CartaoTrilhaProps) {
  const emAndamento = etapasConcluidas > 0 && etapasConcluidas < totalEtapas;
  const cta = etapasConcluidas === 0 ? "Iniciar trilha" : emAndamento ? "Continuar trilha" : "Rever trilha";
  return (
    <Cartao como="article" raio={18} padding={18} className="grid items-center gap-6 desk:grid-cols-[1fr_auto] desk:p-6">
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="text-[11px] font-bold tracking-[.1em] text-accent uppercase">{tag}</div>
        <h3 className="m-0 font-sans text-xl font-extrabold tracking-[-.01em]">{titulo}</h3>
        <p className="m-0 text-sm leading-[1.55] text-muted">{descricao}</p>
        <EtapasTrilha total={totalEtapas} concluidas={etapasConcluidas} />
      </div>
      <div className="flex flex-col items-start gap-2.5 desk:items-end">
        <div className="text-[13px] text-muted">
          {etapasConcluidas} de {totalEtapas} etapas · {duracao}
        </div>
        <Link href={href} className={buttonVariants({ variant: emAndamento ? "primario" : "contorno", size: "42" })}>
          {cta}
        </Link>
      </div>
    </Cartao>
  );
}
