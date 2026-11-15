"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, FileText, ImageIcon, Plus, Trash2, Video } from "lucide-react";
import { ImagemDoStorage, Texto, TextoLongo } from "@/app/admin/paginas/[id]/_components/campos";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { MAX_BLOCOS_CONTEUDO, type BlocoConteudo } from "@/lib/catalogo/conteudo-aula";
import { idDoVideo, urlDoPlayer } from "@/lib/paginas/config";
import { novaChave } from "./capitulos-aula";

/** Bloco na tela: a imagem leva a URL junto; o vídeo, o link como foi colado. */
export type BlocoEditavel = { chave: string } & (
  | { tipo: "TEXTO"; texto: string }
  | { tipo: "IMAGEM"; arquivoId: string | null; url: string | null; alt: string; legenda: string }
  | { tipo: "VIDEO"; link: string }
);

const ROTULO: Record<BlocoEditavel["tipo"], string> = { TEXTO: "Texto", IMAGEM: "Imagem", VIDEO: "Vídeo" };
const ICONE = { TEXTO: FileText, IMAGEM: ImageIcon, VIDEO: Video } as const;
const linkDoVideo = (v: { provedor: "YOUTUBE" | "VIMEO"; id: string }) => (v.provedor === "YOUTUBE" ? `https://youtu.be/${v.id}` : `https://vimeo.com/${v.id}`);
const ERRO_LINK = "Link não reconhecido: use um link do YouTube ou do Vimeo.";

/** Blocos da tela a partir do banco. Aula antiga (sem conteúdo) abre com a descrição num bloco de texto. */
export function editaveisDe(conteudo: BlocoConteudo[] | null, imagens: Record<string, string | null>, descricao: string): BlocoEditavel[] {
  if (!conteudo?.length) return descricao.trim() ? [{ chave: novaChave(), tipo: "TEXTO", texto: descricao }] : [];
  return conteudo.map((b) =>
    b.tipo === "TEXTO"
      ? { chave: novaChave(), tipo: "TEXTO", texto: b.texto }
      : b.tipo === "IMAGEM"
        ? { chave: novaChave(), tipo: "IMAGEM", arquivoId: b.arquivoId, url: imagens[b.arquivoId] ?? null, alt: b.alt, legenda: b.legenda ?? "" }
        : { chave: novaChave(), tipo: "VIDEO", link: linkDoVideo(b) },
  );
}

/**
 * Aula antiga (sem conteúdo) com os blocos como abriram: só a descrição pré-carregada, sem mexer.
 * O "Salvar aula" então não grava conteúdo, e a aula sem vídeo não vira de leitura por tabela (RN-275).
 */
export function aulaAntigaIntacta(conteudo: BlocoConteudo[] | null, descricao: string, blocos: readonly BlocoEditavel[]): boolean {
  if (conteudo?.length) return false;
  if (!descricao.trim()) return blocos.length === 0;
  return blocos.length === 1 && blocos[0].tipo === "TEXTO" && blocos[0].texto === descricao;
}

/** Blocos da tela para a action (o servidor valida de novo) ou o primeiro erro, com o índice do bloco. */
export function paraConteudo(blocos: readonly BlocoEditavel[]): { conteudo: BlocoConteudo[] } | { erro: string; bloco: number } {
  const conteudo: BlocoConteudo[] = [];
  for (const [i, b] of blocos.entries()) {
    const n = `Bloco ${i + 1}`;
    if (b.tipo === "TEXTO") {
      if (!b.texto.trim()) return { erro: `${n}: escreva o texto ou remova o bloco.`, bloco: i };
      conteudo.push({ tipo: "TEXTO", texto: b.texto });
    } else if (b.tipo === "IMAGEM") {
      if (!b.arquivoId) return { erro: `${n}: envie a imagem ou remova o bloco.`, bloco: i };
      if (!b.alt.trim()) return { erro: `${n}: descreva a imagem (para quem usa leitor de tela).`, bloco: i };
      conteudo.push({ tipo: "IMAGEM", arquivoId: b.arquivoId, alt: b.alt, ...(b.legenda.trim() ? { legenda: b.legenda } : {}) });
    } else {
      const v = idDoVideo(b.link);
      if (!v) return { erro: `${n}: ${ERRO_LINK}`, bloco: i };
      conteudo.push({ tipo: "VIDEO", ...v });
    }
  }
  return { conteudo };
}

const novo = (tipo: BlocoEditavel["tipo"]): BlocoEditavel =>
  tipo === "TEXTO" ? { chave: novaChave(), tipo, texto: "" } : tipo === "IMAGEM" ? { chave: novaChave(), tipo, arquivoId: null, url: null, alt: "", legenda: "" } : { chave: novaChave(), tipo, link: "" };

function CorpoDoBloco({ bloco: b, onMudar }: { bloco: BlocoEditavel; onMudar: (b: BlocoEditavel) => void }) {
  if (b.tipo === "TEXTO") return <TextoLongo rotulo="Texto" valor={b.texto} max={5000} linhas={6} ajuda="Linha em branco separa parágrafos. Links https viram clicáveis." onMudar={(texto) => onMudar({ ...b, texto })} />;
  if (b.tipo === "IMAGEM")
    return (
      <div className="flex flex-col gap-3">
        <ImagemDoStorage rotulo="Imagem" arquivoId={b.arquivoId} url={b.url} onMudar={(arquivoId, url) => onMudar({ ...b, arquivoId, url })} />
        <Texto rotulo="Descrição da imagem" valor={b.alt} max={200} ajuda="Obrigatória: lida para quem usa leitor de tela." onMudar={(alt) => onMudar({ ...b, alt })} />
        <Texto rotulo="Legenda (opcional)" valor={b.legenda} max={200} onMudar={(legenda) => onMudar({ ...b, legenda })} />
      </div>
    );
  const v = b.link.trim() ? idDoVideo(b.link) : null;
  return (
    <div className="flex flex-col gap-3">
      <Texto rotulo="Link do vídeo" valor={b.link} max={300} placeholder="https://www.youtube.com/watch?v=…" ajuda={b.link.trim() && !v ? ERRO_LINK : "Só YouTube ou Vimeo."} onMudar={(link) => onMudar({ ...b, link })} />
      {v && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <iframe src={urlDoPlayer(v)} title="Prévia do vídeo" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" className="aspect-video w-full border-0" />
        </div>
      )}
    </div>
  );
}

export interface ConteudoAulaProps {
  blocos: BlocoEditavel[];
  onMudar: (blocos: BlocoEditavel[]) => void;
}

/** Editor do conteúdo da aula (RN-275): texto, imagem e vídeo em qualquer ordem. Grava com o "Salvar aula". */
export function ConteudoAula({ blocos, onMudar }: ConteudoAulaProps) {
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const raiz = useRef<HTMLFieldSetElement>(null);
  // Mover reinsere o bloco no DOM (ou desliga a seta no topo/fim) e o foco cairia no body: devolve à seta.
  // Pelo índice: a `chave` vem de um contador e difere entre servidor e cliente (não vai ao DOM).
  const focar = useRef<{ indice: number; d: -1 | 1 } | null>(null);
  useEffect(() => {
    const f = focar.current;
    if (!f) return;
    focar.current = null;
    raiz.current?.querySelectorAll("[data-bloco]")[f.indice]?.querySelector<HTMLButtonElement>(`[data-mover="${f.d}"]`)?.focus();
  }, [blocos]);
  const mover = (i: number, d: -1 | 1) => {
    const n = [...blocos];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    // No topo/fim a mesma seta desliga: o foco vai para a oposta (decidido pelo índice, não pelo DOM).
    const j = i + d;
    focar.current = { indice: j, d: j === 0 || j === n.length - 1 ? (-d as -1 | 1) : d };
    setAviso(`Bloco de ${ROTULO[blocos[i].tipo].toLowerCase()} movido para a posição ${j + 1} de ${n.length}.`);
    onMudar(n);
  };
  const cheio = blocos.length >= MAX_BLOCOS_CONTEUDO;
  const alvo = blocos.findIndex((b) => b.chave === removendo);
  return (
    <fieldset ref={raiz} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="mb-1 text-[13px] font-semibold">Conteúdo</legend>
      <p className="m-0 text-xs text-muted">
        Texto, imagens e vídeos do YouTube/Vimeo na aba Descrição. Sem vídeo principal, a aula vira de leitura e o conteúdo aparece no lugar do player. {blocos.length}/{MAX_BLOCOS_CONTEUDO} blocos.
      </p>
      {blocos.length === 0 && <EstadoVazio comMoldura icone={<FileText />} titulo="Sem conteúdo" descricao="Adicione um bloco de texto, uma imagem ou um vídeo abaixo." />}
      {blocos.map((b, i) => {
        const Icone = ICONE[b.tipo];
        return (
          // Grupo nomeado "Bloco N · Tipo": os campos repetem o rótulo ("Texto") e o leitor de tela diz de qual bloco são.
          <div key={b.chave} role="group" aria-label={`Bloco ${i + 1} · ${ROTULO[b.tipo]}`} data-bloco="" tabIndex={-1} className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-bg p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-muted">
                <Icone className="size-3.5" aria-hidden />
                <span className="tabular-nums">{i + 1}</span> · {ROTULO[b.tipo]}
              </span>
              <span className="flex">
                <Button type="button" variant="fantasma" size="icone36" className="size-8" aria-label={`Subir bloco ${i + 1}`} data-mover={-1} disabled={i === 0} onClick={() => mover(i, -1)}>
                  <ArrowUp className="size-3.5" aria-hidden />
                </Button>
                <Button type="button" variant="fantasma" size="icone36" className="size-8" aria-label={`Descer bloco ${i + 1}`} data-mover={1} disabled={i === blocos.length - 1} onClick={() => mover(i, 1)}>
                  <ArrowDown className="size-3.5" aria-hidden />
                </Button>
                <Button type="button" variant="fantasma" size="icone36" className="size-8 text-muted" aria-label={`Remover bloco ${i + 1}`} onClick={() => setRemovendo(b.chave)}>
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </span>
            </div>
            <CorpoDoBloco bloco={b} onMudar={(x) => onMudar(blocos.map((y) => (y.chave === x.chave ? x : y)))} />
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        {(["TEXTO", "IMAGEM", "VIDEO"] as const).map((t) => (
          <Button key={t} type="button" variant="contorno" size="36" disabled={cheio} onClick={() => onMudar([...blocos, novo(t)])}>
            <Plus className="size-3.5" aria-hidden />
            {ROTULO[t]}
          </Button>
        ))}
      </div>
      <p role="status" className="sr-only">
        {aviso}
      </p>
      <ModalConfirmacaoBlock
        aberto={removendo !== null}
        titulo="Remover bloco"
        mensagem={`O bloco ${alvo + 1} (${alvo >= 0 ? ROTULO[blocos[alvo].tipo].toLowerCase() : "bloco"}) sai do conteúdo. A mudança só vale depois de "Salvar aula"; uma imagem removida é apagada do armazenamento ao salvar.`}
        textoConfirmar="Remover"
        onCancelar={() => setRemovendo(null)}
        onConfirmar={() => {
          onMudar(blocos.filter((b) => b.chave !== removendo));
          setRemovendo(null);
        }}
      />
    </fieldset>
  );
}
