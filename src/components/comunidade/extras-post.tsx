"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { AnexoMaterial } from "@/components/curso/anexo-material";
import { Aviso } from "@/components/ui/aviso";
import { EspacoImagem } from "@/components/ui/espaco-imagem";
import { acaoLinkDoAnexo, acaoVotarEnquete } from "@/lib/actions/comunidade";
import { formatarTamanho } from "@/lib/armazenamento/regras";
import type { AnexoDoPost, EnqueteDoPost } from "@/lib/comunidade/consultas";
import { cn } from "@/lib/utils";
import { aplicarVoto, contagem, dataHoraCurta, percentual } from "./formatos";

/** Imagens em grade (1 = largura toda; 2–4 = 2 colunas) e PDFs que pedem o link curto no clique. */
export function AnexosPost({ anexos }: { anexos: readonly AnexoDoPost[] }) {
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const imagens = anexos.filter((a) => a.tipo === "IMAGEM");
  const pdfs = anexos.filter((a) => a.tipo === "PDF");
  if (anexos.length === 0) return null;

  const abrirPdf = async (a: AnexoDoPost) => {
    setErro(null);
    setAbrindo(a.id);
    const r = await acaoLinkDoAnexo({ anexoId: a.id }).catch(() => null);
    setAbrindo(null);
    if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
    if (!r.ok) return setErro(r.erro);
    window.location.assign(r.dados.url); // link de 5 min; o storage responde como download
  };

  return (
    <div className="flex flex-col gap-2.5">
      {imagens.length > 0 && (
        <div className={cn("grid gap-1.5 overflow-hidden rounded-xl", imagens.length > 1 && "grid-cols-2")}>
          {imagens.map((a) =>
            a.url ? (
              <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="block focus-visible:outline-offset-[-3px]">
                <EspacoImagem src={a.url} alt={a.nome} proporcao={imagens.length === 1 ? "16/9" : "16/10"} sizes="(min-width: 900px) 640px, 100vw" />
                <span className="sr-only"> (abre a imagem em outra aba)</span>
              </a>
            ) : (
              <EspacoImagem key={a.id} alt={a.nome} dica="Imagem indisponível" proporcao="16/10" />
            ),
          )}
        </div>
      )}
      {pdfs.length > 0 && (
        <div className="flex flex-wrap gap-2.5">
          {pdfs.map((a) => (
            <AnexoMaterial key={a.id} tipo="PDF" nome={a.nome} detalhe={formatarTamanho(a.tamanho)} onAbrir={() => void abrirPdf(a)} carregando={abrindo === a.id} />
          ))}
        </div>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </div>
  );
}

/**
 * Enquete: antes de votar, as opções são botões; depois (ou encerrada), barras com o percentual e a
 * marca no meu voto — dá para trocar enquanto estiver aberta. Voto otimista com reversão.
 */
export function EnquetePost({ postId, inicial, podeVotar }: { postId: string; inicial: EnqueteDoPost; podeVotar: boolean }) {
  const [enquete, setEnquete] = useState(inicial);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const votavel = podeVotar && enquete.aberta;
  const resultado = enquete.meuVoto !== null || !votavel;

  const votar = async (opcao: number) => {
    if (enviando || !votavel || enquete.meuVoto === opcao) return;
    const antes = enquete;
    setEnquete(aplicarVoto(antes, opcao));
    setErro(null);
    setEnviando(true);
    const r = await acaoVotarEnquete({ postId, opcao }).catch(() => null);
    setEnviando(false);
    if (r?.ok) return;
    setEnquete(antes);
    setErro(r ? r.erro : "Sem conexão. O voto não foi salvo.");
  };

  const rodape = [
    contagem(enquete.totalVotos, "voto", "votos"),
    enquete.aberta ? (enquete.encerraEm ? `encerra em ${dataHoraCurta(enquete.encerraEm)}` : null) : "encerrada",
    votavel && enquete.meuVoto !== null ? "toque em outra opção para trocar" : null,
  ].filter(Boolean);

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 rounded-xl border border-border p-3.5">
      <legend className="float-left mb-1 w-full p-0 text-sm font-bold">{enquete.pergunta}</legend>
      {enquete.opcoes.map((o) => {
        const pct = percentual(o.votos, enquete.totalVotos);
        const meu = enquete.meuVoto === o.indice;
        return (
          <button
            key={o.indice}
            type="button"
            disabled={!votavel || enviando}
            aria-pressed={meu}
            onClick={() => void votar(o.indice)}
            className={cn(
              "relative flex min-h-10 w-full items-center gap-2 overflow-hidden rounded-lg border px-3 text-left text-[13px] font-semibold transition-colors duration-150 enabled:cursor-pointer disabled:cursor-default",
              meu ? "border-accent" : "border-border",
              !resultado && "enabled:hover:bg-surface-2",
            )}
          >
            {resultado && <span aria-hidden className={cn("absolute inset-y-0 left-0", meu ? "bg-accent-soft" : "bg-surface-2")} style={{ width: `${pct}%` }} />}
            <span className="relative flex-1">{o.texto}</span>
            {meu && <Check aria-label="seu voto" className="relative size-4 text-accent" />}
            {resultado && <span className="relative text-xs font-bold text-muted">{pct}%</span>}
          </button>
        );
      })}
      <p className="m-0 text-xs text-muted">{rodape.join(" · ")}</p>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </fieldset>
  );
}
