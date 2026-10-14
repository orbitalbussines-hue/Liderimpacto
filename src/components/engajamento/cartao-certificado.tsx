import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/marca/logo";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { Button, buttonVariants } from "@/components/ui/button";
import { Cartao } from "@/components/ui/cartao";

export interface CartaoCertificadoProps {
  titulo: string;
  /** "Emitido em 21/09/2026 · 3 aulas". */
  meta: string;
  nomeAluno: string;
  bloqueado: boolean;
  /** 0 a 100, mostrado quando bloqueado. */
  progresso?: number;
  /** PDF do certificado emitido (link direto; a tela real usa `acao`). */
  hrefPdf?: string;
  /** Curso a continuar (quando bloqueado). */
  hrefCurso?: string;
  /** Texto do véu sobre a prévia. Padrão quando bloqueado: "Conclua o curso para emitir". */
  sobreposicao?: string;
  /** Selo ao lado do título (Revogado, Gerando PDF). */
  selo?: ReactNode;
  /** Botão(ões) prontos: substitui o botão padrão (ex.: BotaoBaixarCertificado client). */
  acao?: ReactNode;
  /** Conteúdo extra entre a meta e a ação (o que falta, link Verificar). */
  detalhe?: ReactNode;
}

/**
 * Prévia do certificado (proporção 1.414) + ação. O "papel" usa surface no escuro e um
 * branco quente no claro (não há token para isso: variante local, ver relatório).
 */
export function CartaoCertificado({ titulo, meta, nomeAluno, bloqueado, progresso = 0, hrefPdf, hrefCurso, sobreposicao, selo, acao, detalhe }: CartaoCertificadoProps) {
  const veu = sobreposicao ?? (bloqueado ? "Conclua o curso para emitir" : null);
  const botaoPadrao = bloqueado ? (
    hrefCurso ? (
      <Link href={hrefCurso} className={buttonVariants({ variant: "contorno", larguraTotal: true })}>
        Continuar curso
      </Link>
    ) : (
      <Button variant="contorno" larguraTotal disabled>
        Baixar PDF
      </Button>
    )
  ) : hrefPdf ? (
    <a href={hrefPdf} download className={buttonVariants({ larguraTotal: true })}>
      Baixar PDF
    </a>
  ) : (
    <Button larguraTotal disabled>
      Baixar PDF
    </Button>
  );
  return (
    <Cartao como="article" raio={18} padding={0} className="flex flex-col overflow-hidden">
      <div className="relative flex aspect-[1.414] flex-col justify-between border-b border-border bg-surface p-[22px] [[data-theme=light]_&]:bg-[#FBFAF6]">
        <div className="flex items-center justify-between">
          <Logo variante="bloco" tamanho={10} />
          <div className="text-[9px] tracking-[.2em] text-muted uppercase">Certificado</div>
        </div>
        <div>
          <div className="mb-1.5 text-[9px] tracking-[.14em] text-muted uppercase">Certificamos que</div>
          <div className="text-[17px] font-extrabold tracking-[-.01em] text-text">{nomeAluno}</div>
          <div className="mt-1 text-[11px] text-muted">concluiu {titulo}</div>
        </div>
        {veu && (
          <div className="absolute inset-0 grid place-items-center bg-fixo-bg/55 px-6 text-center text-[13px] font-bold text-fixo-text backdrop-blur-[3px]">
            {veu}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="m-0 font-sans text-[15px] font-bold">{titulo}</h3>
          {selo}
        </div>
        <div className="text-xs text-muted">{meta}</div>
        {bloqueado && <BarraProgresso valor={progresso} mostrarPercentual rotulo={`Progresso em ${titulo}`} />}
        {detalhe}
        <div className="mt-auto">{acao ?? botaoPadrao}</div>
      </div>
    </Cartao>
  );
}
