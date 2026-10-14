import Link from "next/link";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { buttonVariants } from "@/components/ui/button";
import { Cartao } from "@/components/ui/cartao";
import { EspacoImagem } from "@/components/ui/espaco-imagem";

export interface CartaoCursoProps {
  titulo: string;
  capaUrl?: string;
  capaDica?: string;
  /** 0 a 100. */
  progresso: number;
  aulasConcluidas: number;
  totalAulas: number;
  href: string;
  /** Texto do botão (padrão "Acessar"). */
  textoBotao?: string;
}

/**
 * Cartão da tela Continuar: capa 16:10, título em caixa alta, progresso e "Acessar".
 * (Os ícones de coração/estrela do protótipo eram decorativos: ficam de fora até existir a ação.)
 */
export function CartaoCurso({ titulo, capaUrl, capaDica, progresso, aulasConcluidas, totalAulas, href, textoBotao = "Acessar" }: CartaoCursoProps) {
  return (
    <Cartao como="article" padding={0} className="flex flex-col overflow-hidden">
      <EspacoImagem src={capaUrl} alt="" dica={capaDica ?? `Capa · ${titulo}`} proporcao="16/10" sizes="(min-width: 900px) 33vw, 100vw" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="m-0 font-sans text-[15px] font-bold tracking-[.02em] uppercase">{titulo}</h3>
        <BarraProgresso valor={progresso} mostrarPercentual rotulo={`Progresso em ${titulo}`} />
        <div className="text-xs text-muted">
          {aulasConcluidas}/{totalAulas} aulas
        </div>
        <Link href={href} className={buttonVariants({ size: "42", larguraTotal: true, className: "mt-auto" })}>
          {textoBotao}
          <span className="sr-only"> {titulo}</span>
        </Link>
      </div>
    </Cartao>
  );
}
