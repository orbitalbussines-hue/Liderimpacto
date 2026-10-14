import type { CSSProperties } from "react";
import { encode } from "uqr";
import { cn } from "@/lib/utils";

/**
 * Prévia em HTML FIEL ao PDF do worker (`src/lib/certificados/pdf.ts`): A4 paisagem (841,89 × 595,28 pt),
 * mesmas posições, corpos e fontes, em unidades do contêiner (`--pt` = 1 ponto do PDF). Mexeu no PDF,
 * mexa aqui. O papel é sempre claro (tema claro local), como o impresso.
 */

const W = 841.89;
const H = 595.28;

export interface DadosPreviaCertificado {
  /** Nome do criador ("logo" em texto, maiúsculas). */
  criador: string;
  titulo: string;
  /** Texto JÁ preenchido (com o nome dentro). */
  texto: string;
  nome: string;
  assinaturaNome: string;
  assinaturaCargo: string;
  /** Hex já ajustado para o papel claro (`corDoCertificado`). */
  cor: string;
  /** "K7M2X-9QP4H". */
  codigoLegivel: string;
  /** URL de verificação (vai no QR). */
  urlVerificacao: string;
  /** "14 de outubro de 2026". */
  concluidoEm: string;
}

/** Mesma divisão do PDF: o que vem antes do nome (linha em itálico) e o resto (corpo). */
export function partesDoTexto(texto: string, nome: string): { antes: string; depois: string } {
  const i = nome ? texto.indexOf(nome) : -1;
  return {
    antes: (i >= 0 ? texto.slice(0, i) : "").trim(),
    depois: (i >= 0 ? texto.slice(i + nome.length) : texto).trim().replace(/^[,.;:]\s*/, ""),
  };
}

const pt = (n: number) => `calc(var(--pt) * ${n})`;
/** Texto com a LINHA DE BASE a `base` pt do topo (o PDF posiciona pela base). */
const linha = (base: number, corpo: number): CSSProperties => ({ top: pt(base - corpo * 0.8), fontSize: pt(corpo), lineHeight: 1 });

function Qr({ texto }: { texto: string }) {
  const { data, size } = encode(texto || "-", { border: 0 });
  const d = data.flatMap((l, i) => l.flatMap((preto, j) => (preto ? [`M${j} ${i}h1v1h-1z`] : []))).join("");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="absolute fill-text" style={{ left: pt(70), bottom: pt(64), width: pt(78), height: pt(78) }} aria-hidden shapeRendering="crispEdges">
      <path d={d} />
    </svg>
  );
}

export function PreviaCertificado({ dados, className }: { dados: DadosPreviaCertificado; className?: string }) {
  const { antes, depois } = partesDoTexto(dados.texto, dados.nome);
  const url = dados.urlVerificacao.replace(/^https?:\/\//, "");
  // Nome longo encolhe (o PDF reduz o corpo até caber em W − 220).
  const corpoNome = Math.max(18, Math.min(44, Math.floor(((W - 220) / Math.max(1, dados.nome.length)) * 1.9)));
  return (
    <div className={cn("@container w-full", className)}>
      <div
        data-theme="light"
        role="img"
        aria-label={`Prévia do certificado: ${dados.titulo}. ${dados.texto}`}
        className="relative w-full overflow-hidden bg-surface text-text shadow-card"
        style={{ aspectRatio: `${W} / ${H}`, "--pt": `calc(100cqw / ${W})`, "--cor": dados.cor } as CSSProperties}
      >
        <div aria-hidden className="absolute border-solid border-(--cor)" style={{ inset: pt(22), borderWidth: pt(2.2) }} />
        <div aria-hidden className="absolute border-solid border-(--cor)" style={{ inset: pt(30), borderWidth: pt(0.6) }} />
        <div aria-hidden className="absolute bg-(--cor)" style={{ left: pt(30), top: pt(30), bottom: pt(30), width: pt(10) }} />

        <div aria-hidden className="absolute inset-x-0 top-0 text-center">
          <div className="absolute inset-x-0 font-serif font-semibold whitespace-nowrap text-(--cor) uppercase" style={linha(92, 15)}>
            {dados.criador}
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 bg-(--cor)" style={{ top: pt(104), width: pt(56), height: pt(1) }} />
          <div className="absolute inset-x-0 font-sans font-bold whitespace-nowrap text-muted uppercase" style={linha(140, 13)}>
            {dados.titulo}
          </div>
          {antes && (
            <div className="absolute inset-x-0 font-serif whitespace-nowrap text-muted italic" style={linha(190, 17)}>
              {antes}
            </div>
          )}
          <div className="absolute inset-x-0 overflow-hidden font-serif font-semibold whitespace-nowrap" style={linha(250, corpoNome)}>
            {dados.nome}
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 bg-(--cor)" style={{ top: pt(266), width: pt(340), height: pt(0.6) }} />
          <div className="absolute left-1/2 -translate-x-1/2 font-sans" style={{ top: pt(302 - 13 * 0.8 - 3.5), width: pt(W - 260), fontSize: pt(13), lineHeight: pt(20) }}>
            {depois}
          </div>
        </div>

        <Qr texto={dados.urlVerificacao} />
        <div aria-hidden className="absolute font-sans" style={{ left: pt(162), bottom: pt(64) }}>
          <div className="absolute font-bold whitespace-nowrap text-muted" style={{ bottom: pt(62), fontSize: pt(9), lineHeight: 1 }}>
            Verifique a autenticidade
          </div>
          <div className="absolute font-bold whitespace-nowrap" style={{ bottom: pt(44), fontSize: pt(12), lineHeight: 1 }}>
            Código {dados.codigoLegivel}
          </div>
          <div className="absolute whitespace-nowrap text-muted" style={{ bottom: pt(28), fontSize: pt(9), lineHeight: 1 }}>
            {url}
          </div>
          <div className="absolute whitespace-nowrap text-muted" style={{ bottom: pt(12), fontSize: pt(9), lineHeight: 1 }}>
            Concluído em {dados.concluidoEm}
          </div>
        </div>

        <div aria-hidden className="absolute text-center font-sans" style={{ left: pt(W - 350), width: pt(200), bottom: pt(64) }}>
          <div className="absolute inset-x-0 bg-text" style={{ bottom: pt(40), height: pt(0.8) }} />
          <div className="absolute inset-x-0 truncate font-bold" style={{ bottom: pt(22), fontSize: pt(12), lineHeight: 1 }}>
            {dados.assinaturaNome}
          </div>
          {dados.assinaturaCargo && (
            <div className="absolute inset-x-0 truncate text-muted" style={{ bottom: pt(6), fontSize: pt(10), lineHeight: 1 }}>
              {dados.assinaturaCargo}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
