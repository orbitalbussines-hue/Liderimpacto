"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ImageUp, Plus, Trash2, X } from "lucide-react";
import { useEnvioDeArquivo } from "@/components/admin/use-envio-arquivo";
import { AreaTexto } from "@/components/ui/area-texto";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { EspacoImagem } from "@/components/ui/espaco-imagem";
import { Selecao } from "@/components/ui/selecao";
import { acaoPrepararImagemPagina } from "@/lib/actions/paginas";
import { atributoAccept } from "@/lib/armazenamento/regras";
import { ACOES_BOTAO_PAGINA, ROTULO_ACAO_BOTAO, type AcaoBotaoPagina, type BotaoPagina } from "@/lib/paginas/config";

/** Peças dos formulários de propriedades do editor de páginas (mesma régua do construtor da vitrine). */

export function Texto({ rotulo, valor, max, onMudar, ajuda, placeholder }: { rotulo: string; valor: string; max: number; onMudar: (v: string) => void; ajuda?: string; placeholder?: string }) {
  return <Campo rotulo={rotulo} estiloRotulo="discreto" tamanho="42" fundo="bg" value={valor} maxLength={max} ajuda={ajuda} placeholder={placeholder} onChange={(e) => onMudar(e.target.value)} />;
}

export function TextoLongo({ rotulo, valor, max, onMudar, linhas = 4, ajuda }: { rotulo: string; valor: string; max: number; onMudar: (v: string) => void; linhas?: number; ajuda?: string }) {
  return <AreaTexto rotulo={rotulo} estiloRotulo="discreto" fundo="bg" rows={linhas} value={valor} maxLength={max} ajuda={ajuda} onChange={(e) => onMudar(e.target.value)} />;
}

export function Titulo({ children }: { children: ReactNode }) {
  return <h2 className="m-0 text-sm font-extrabold">{children}</h2>;
}

/** Lista editável (benefícios, depoimentos, perguntas): adicionar, remover, subir e descer. */
export function ListaItens<T>({ rotulo, itens, max, min = 0, novo, onMudar, render }: { rotulo: string; itens: T[]; max: number; min?: number; novo: () => T; onMudar: (v: T[]) => void; render: (item: T, mudar: (x: T) => void, i: number) => ReactNode }) {
  const mover = (i: number, d: -1 | 1) => {
    const n = [...itens];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    onMudar(n);
  };
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[11px] font-bold text-muted">
        {rotulo} ({itens.length}/{max})
      </span>
      {itens.map((it, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted tabular-nums">{i + 1}</span>
            <span className="flex">
              <Button type="button" variant="fantasma" size="icone36" className="size-7" aria-label={`Subir item ${i + 1}`} disabled={i === 0} onClick={() => mover(i, -1)}>
                <ArrowUp className="size-3.5" aria-hidden />
              </Button>
              <Button type="button" variant="fantasma" size="icone36" className="size-7" aria-label={`Descer item ${i + 1}`} disabled={i === itens.length - 1} onClick={() => mover(i, 1)}>
                <ArrowDown className="size-3.5" aria-hidden />
              </Button>
              <Button type="button" variant="fantasma" size="icone36" className="size-7 text-muted" aria-label={`Remover item ${i + 1}`} disabled={itens.length <= min} onClick={() => onMudar(itens.filter((_, j) => j !== i))}>
                <X className="size-3.5" aria-hidden />
              </Button>
            </span>
          </div>
          {render(it, (x) => onMudar(itens.map((y, j) => (j === i ? x : y))), i)}
        </div>
      ))}
      <Button type="button" variant="contorno" size="36" className="border-dashed text-accent" disabled={itens.length >= max} onClick={() => onMudar([...itens, novo()])}>
        <Plus aria-hidden />
        Adicionar
      </Button>
    </div>
  );
}

/** Imagem do storage (envio direto, finalidade IMAGEM): a action confere que é desta área. */
export function ImagemDoStorage({ rotulo, arquivoId, url, onMudar, proporcao = "16/10" }: { rotulo: string; arquivoId: string | null; url: string | null; onMudar: (arquivoId: string | null, url: string | null) => void; proporcao?: "16/9" | "16/10" | "3/4" }) {
  const entrada = useRef<HTMLInputElement>(null);
  const { enviar, progresso, enviando, erro, setErro } = useEnvioDeArquivo("IMAGEM");
  const [preparando, setPreparando] = useState(false);
  const escolher = async (arquivo: File | undefined) => {
    if (entrada.current) entrada.current.value = "";
    if (!arquivo) return;
    const id = await enviar(arquivo);
    if (!id) return;
    setPreparando(true);
    const r = await acaoPrepararImagemPagina({ arquivoId: id });
    setPreparando(false);
    if (!r.ok) return setErro(r.erro);
    onMudar(id, r.dados.url);
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold">{rotulo}</span>
      <div className="overflow-hidden rounded-xl border border-border">
        <EspacoImagem src={arquivoId ? url : null} alt={rotulo} dica={arquivoId ? undefined : "Sem imagem"} proporcao={proporcao} sizes="320px" />
      </div>
      {progresso !== null && <BarraProgresso valor={progresso} rotulo={`Enviando: ${rotulo}`} mostrarPercentual />}
      {erro && (
        <p role="alert" className="m-0 text-xs font-semibold text-warn">
          {erro}
        </p>
      )}
      <input ref={entrada} type="file" accept={atributoAccept("IMAGEM")} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => escolher(e.target.files?.[0])} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="contorno" size="36" carregando={enviando || preparando} onClick={() => entrada.current?.click()}>
          <ImageUp aria-hidden />
          {arquivoId ? "Trocar imagem" : "Enviar imagem"}
        </Button>
        {arquivoId && (
          <Button type="button" variant="fantasma" size="36" onClick={() => onMudar(null, null)}>
            <Trash2 aria-hidden />
            Remover
          </Button>
        )}
      </div>
    </div>
  );
}

/** Botão: texto + ação (rolar até o preço/formulário ou link https). */
export function EditorBotaoPagina({ rotulo, botao, onMudar }: { rotulo: string; botao: BotaoPagina; onMudar: (b: BotaoPagina) => void }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border p-3">
      <span className="text-[13px] font-bold">{rotulo}</span>
      <Texto rotulo="Texto" valor={botao.texto} max={40} onMudar={(texto) => onMudar({ ...botao, texto })} />
      <Selecao
        rotulo="Ao clicar"
        estiloRotulo="discreto"
        fundo="bg"
        value={botao.acao}
        opcoes={ACOES_BOTAO_PAGINA.map((a) => ({ valor: a, rotulo: ROTULO_ACAO_BOTAO[a] }))}
        onChange={(e) => {
          const acao = e.target.value as AcaoBotaoPagina;
          onMudar({ ...botao, acao, url: acao === "LINK" ? (botao.url ?? "https://") : null });
        }}
      />
      {botao.acao === "LINK" && <Texto rotulo="Link" valor={botao.url ?? ""} max={500} placeholder="https://" onMudar={(url) => onMudar({ ...botao, url })} />}
    </div>
  );
}
