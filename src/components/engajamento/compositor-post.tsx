"use client";

import { useRef, useState } from "react";
import { FileText, Image as ImagemIcone, List, Plus, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { AreaTexto } from "@/components/ui/area-texto";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { Cartao } from "@/components/ui/cartao";
import { Selecao } from "@/components/ui/selecao";
import { ErroDeNegocio } from "@/lib/acao";
import { atributoAccept, formatarTamanho, mimeDaExtensao, validarEnvio } from "@/lib/armazenamento/regras";
import { ENQUETE_OPCOES_MAX, ENQUETE_OPCOES_MIN, FINALIDADE_IMAGEM, FINALIDADE_PDF, MAX_IMAGENS_POST, MAX_PDFS_POST, problemaDosAnexos, TEXTO_POST_MAX } from "@/lib/comunidade/regras";
import type { FinalidadeArquivo } from "@/lib/db/schema/_enums";
import { cn } from "@/lib/utils";

export interface DadosPublicacao {
  canalId: string | null;
  texto: string;
  aulaId: string | null;
  anexoIds: string[];
  enquete: { pergunta: string; opcoes: string[]; encerraEm: string | null } | null;
}

export type ResultadoEnvioAnexo = { ok: true; arquivoId: string } | { ok: false; erro: string };

export interface CompositorPostProps {
  nomeUsuario: string;
  avatarSrc?: string | null;
  /** Silenciado: só o aviso, sem campo. */
  bloqueio?: string | null;
  /** "Publicar em" (feed de todos os canais). Vazio/ausente = canal da página. */
  canais?: readonly { id: string; nome: string }[];
  /** Aula relacionada opcional ("em <aula>"). */
  aulas?: readonly { id: string; titulo: string; grupo?: string }[];
  /** Sobe o arquivo (URL assinada + PUT + confirmação). Sem isto (catálogo), só a prévia local. */
  enviarAnexo?: (arquivo: File, finalidade: FinalidadeArquivo, aoProgredir: (pct: number) => void) => Promise<ResultadoEnvioAnexo>;
  /** Publica; devolve a mensagem de erro ou `null` (aí o compositor limpa). */
  publicar?: (d: DadosPublicacao) => Promise<string | null>;
}

interface Rascunho {
  chave: string;
  nome: string;
  finalidade: FinalidadeArquivo;
  tamanho: number;
  previa: string | null;
  progresso: number | null;
  arquivoId: string | null;
}

interface Enquete {
  pergunta: string;
  opcoes: string[];
  encerraEm: string;
}

const ENQUETE_VAZIA: Enquete = { pergunta: "", opcoes: ["", ""], encerraEm: "" };
const classeFerramenta =
  "-mx-1 inline-flex min-h-9 cursor-pointer items-center gap-[5px] rounded-md px-1 text-[13px] text-muted transition-colors duration-150 hover:text-text aria-pressed:font-semibold aria-pressed:text-accent disabled:cursor-not-allowed disabled:opacity-50";

/** Problema da enquete antes de publicar (o validador do servidor confere de novo). */
export function problemaDaEnquete(e: Enquete): string | null {
  const opcoes = e.opcoes.map((o) => o.trim()).filter(Boolean);
  if (!e.pergunta.trim()) return "Escreva a pergunta da enquete.";
  if (opcoes.length < ENQUETE_OPCOES_MIN) return `A enquete precisa de ao menos ${ENQUETE_OPCOES_MIN} opções.`;
  if (new Set(opcoes.map((o) => o.toLowerCase())).size !== opcoes.length) return "Há opções repetidas na enquete.";
  if (e.encerraEm && new Date(e.encerraEm).getTime() <= Date.now()) return "O encerramento da enquete precisa ser no futuro.";
  return null;
}

/**
 * Compositor da comunidade (tela 8): texto, até 4 imagens e 2 PDFs com prévia e remoção antes
 * de publicar, enquete de 2 a 6 opções com encerramento opcional, canal e aula relacionada.
 * O envio e a publicação entram por props (`enviarAnexo`, `publicar`): o catálogo usa sem eles.
 */
export function CompositorPost({ nomeUsuario, avatarSrc, bloqueio, canais = [], aulas = [], enviarAnexo, publicar }: CompositorPostProps) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [anexos, setAnexos] = useState<Rascunho[]>([]);
  const [enquete, setEnquete] = useState<Enquete | null>(null);
  const [canalId, setCanalId] = useState(canais[0]?.id ?? "");
  const [aulaId, setAulaId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
  const entradaImagem = useRef<HTMLInputElement>(null);
  const entradaPdf = useRef<HTMLInputElement>(null);

  if (bloqueio)
    return (
      <Cartao padding={16} className="flex items-center gap-3">
        <Avatar nome={nomeUsuario} src={avatarSrc} tamanho={40} tom="accent" />
        <Aviso tom="info" className="flex-1">
          {bloqueio}
        </Aviso>
      </Cartao>
    );

  const imagens = anexos.filter((a) => a.finalidade === FINALIDADE_IMAGEM).length;
  const pdfs = anexos.length - imagens;
  const enviando = anexos.some((a) => a.progresso !== null);
  const expandido = aberto || !!texto || anexos.length > 0 || !!enquete;

  const atualizar = (chave: string, m: Partial<Rascunho>) => setAnexos((l) => l.map((a) => (a.chave === chave ? { ...a, ...m } : a)));
  const remover = (chave: string) =>
    setAnexos((l) => {
      const a = l.find((x) => x.chave === chave);
      if (a?.previa) URL.revokeObjectURL(a.previa);
      return l.filter((x) => x.chave !== chave);
    });

  const escolher = (lista: FileList | null, finalidade: FinalidadeArquivo) => {
    if (!lista?.length) return;
    setErro(null);
    setAberto(true);
    const finalidades = anexos.map((a) => a.finalidade);
    for (const arquivo of Array.from(lista)) {
      const limite = problemaDosAnexos([...finalidades, finalidade]);
      if (limite) {
        setErro(limite);
        break;
      }
      const mime = arquivo.type || mimeDaExtensao(finalidade, arquivo.name) || "application/octet-stream";
      try {
        validarEnvio(finalidade, { nome: arquivo.name, mime, tamanho: arquivo.size });
      } catch (e) {
        setErro(`${arquivo.name}: ${e instanceof ErroDeNegocio ? e.message : "arquivo inválido."}`);
        continue;
      }
      finalidades.push(finalidade);
      const chave = `${arquivo.name}-${arquivo.size}-${Math.random().toString(36).slice(2)}`;
      const previa = finalidade === FINALIDADE_IMAGEM && typeof URL.createObjectURL === "function" ? URL.createObjectURL(arquivo) : null;
      setAnexos((l) => [...l, { chave, nome: arquivo.name, finalidade, tamanho: arquivo.size, previa, progresso: enviarAnexo ? 0 : null, arquivoId: null }]);
      if (enviarAnexo)
        void enviarAnexo(arquivo, finalidade, (pct) => atualizar(chave, { progresso: pct })).then((r) => {
          if (r.ok) return atualizar(chave, { progresso: null, arquivoId: r.arquivoId });
          remover(chave);
          setErro(`${arquivo.name}: ${r.erro}`);
        });
    }
  };

  const limpar = () => {
    anexos.forEach((a) => a.previa && URL.revokeObjectURL(a.previa));
    setTexto("");
    setAnexos([]);
    setEnquete(null);
    setAulaId("");
    setAberto(false);
  };

  const enviar = async () => {
    if (!publicar) return;
    const problema = enquete ? problemaDaEnquete(enquete) : null;
    if (problema) return setErro(problema);
    setErro(null);
    setPublicando(true);
    const e = await publicar({
      canalId: canalId || null,
      texto,
      aulaId: aulaId || null,
      anexoIds: anexos.flatMap((a) => (a.arquivoId ? [a.arquivoId] : [])),
      enquete: enquete
        ? { pergunta: enquete.pergunta, opcoes: enquete.opcoes.map((o) => o.trim()).filter(Boolean), encerraEm: enquete.encerraEm ? new Date(enquete.encerraEm).toISOString() : null }
        : null,
    }).catch(() => "Sem conexão com o servidor. Tente de novo.");
    setPublicando(false);
    if (e) return setErro(e);
    limpar();
  };

  return (
    <Cartao padding={16} className="flex flex-col gap-3">
      <div className={cn("flex gap-3", expandido ? "items-start" : "items-center")}>
        <Avatar nome={nomeUsuario} src={avatarSrc} tamanho={40} tom="accent" />
        <AreaTexto
          rotulo="Nova publicação"
          rotuloOculto
          placeholder="Compartilhe algo com a comunidade..."
          classNameMoldura="flex-1"
          className={cn("transition-[height] duration-150", !expandido && "h-11 min-h-11 resize-none overflow-hidden py-[11px] whitespace-nowrap")}
          rows={expandido ? 4 : 1}
          maxLength={TEXTO_POST_MAX}
          value={texto}
          onFocus={() => setAberto(true)}
          onChange={(e) => setTexto(e.target.value)}
        />
      </div>

      {anexos.length > 0 && (
        <ul aria-label="Anexos da publicação" className="m-0 flex list-none flex-wrap gap-2 p-0">
          {anexos.map((a) => (
            <li key={a.chave} className={cn("relative flex items-center overflow-hidden rounded-lg border border-border bg-surface-2", a.previa ? "size-[76px]" : "h-[52px] max-w-[260px] gap-2 pr-9 pl-2.5")}>
              {a.previa ? (
                // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:), fora do otimizador
                <img src={a.previa} alt={a.nome} className="size-full object-cover" />
              ) : (
                <>
                  <FileText aria-hidden className="size-5 shrink-0 text-muted" />
                  <span className="flex min-w-0 flex-col text-xs">
                    <span className="truncate font-semibold">{a.nome}</span>
                    <span className="text-muted">{formatarTamanho(a.tamanho)}</span>
                  </span>
                </>
              )}
              {a.progresso !== null && (
                <span role="progressbar" aria-label={`Enviando ${a.nome}`} aria-valuenow={a.progresso} aria-valuemin={0} aria-valuemax={100} className="absolute inset-x-0 bottom-0 h-1 bg-border">
                  <span className="block h-full bg-accent transition-[width]" style={{ width: `${a.progresso}%` }} />
                </span>
              )}
              <button
                type="button"
                onClick={() => remover(a.chave)}
                aria-label={`Remover ${a.nome}`}
                className="absolute top-1 right-1 grid size-6 cursor-pointer place-items-center rounded-full bg-bg/85 text-text hover:bg-bg"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {enquete && <EditorEnquete enquete={enquete} onMudar={setEnquete} onRemover={() => setEnquete(null)} />}

      {expandido && (canais.length > 1 || aulas.length > 0) && (
        <div className="grid gap-3 desk:grid-cols-2">
          {canais.length > 1 && <Selecao rotulo="Publicar em" tamanho="36" opcoes={canais.map((c) => ({ valor: c.id, rotulo: `# ${c.nome}` }))} value={canalId} onChange={(e) => setCanalId(e.target.value)} />}
          {aulas.length > 0 && (
            <Selecao rotulo="Aula relacionada" tamanho="36" vazio="Nenhuma (opcional)" opcoes={aulas.map((a) => ({ valor: a.id, rotulo: a.titulo, grupo: a.grupo }))} value={aulaId} onChange={(e) => setAulaId(e.target.value)} />
          )}
        </div>
      )}

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-3.5">
          <button type="button" className={classeFerramenta} onClick={() => entradaImagem.current?.click()} disabled={imagens >= MAX_IMAGENS_POST}>
            <ImagemIcone aria-hidden className="size-[15px]" />
            <span className="max-[430px]:sr-only">Imagem</span>
          </button>
          <button type="button" className={classeFerramenta} aria-pressed={!!enquete} onClick={() => {
              setAberto(true);
              setEnquete((e) => e ?? ENQUETE_VAZIA);
            }}>
            <List aria-hidden className="size-[15px]" />
            <span className="max-[430px]:sr-only">Enquete</span>
          </button>
          <button type="button" className={classeFerramenta} onClick={() => entradaPdf.current?.click()} disabled={pdfs >= MAX_PDFS_POST}>
            <FileText aria-hidden className="size-[15px]" />
            <span className="max-[430px]:sr-only">Anexo</span>
          </button>
          <input ref={entradaImagem} type="file" hidden multiple accept={atributoAccept(FINALIDADE_IMAGEM)} aria-label="Escolher imagens" onChange={(e) => {
              escolher(e.target.files, FINALIDADE_IMAGEM);
              e.target.value = "";
            }} />
          <input ref={entradaPdf} type="file" hidden multiple accept={atributoAccept(FINALIDADE_PDF)} aria-label="Escolher PDF" onChange={(e) => {
              escolher(e.target.files, FINALIDADE_PDF);
              e.target.value = "";
            }} />
        </div>
        <Button size="36" className="px-4" carregando={publicando} disabled={!texto.trim() || enviando} onClick={() => void enviar()}>
          {enviando ? "Enviando anexos..." : "Publicar"}
        </Button>
      </div>
    </Cartao>
  );
}

function EditorEnquete({ enquete, onMudar, onRemover }: { enquete: Enquete; onMudar: (e: Enquete) => void; onRemover: () => void }) {
  const mudarOpcao = (i: number, v: string) => onMudar({ ...enquete, opcoes: enquete.opcoes.map((o, j) => (j === i ? v : o)) });
  // Mínimo do datetime-local: agora, no fuso do navegador (o mesmo do valor digitado).
  const [agora] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  return (
    <fieldset className="relative m-0 flex min-w-0 flex-col gap-2.5 rounded-xl border border-border p-3.5">
      <legend className="float-left min-h-9 p-0 text-sm leading-9 font-bold">Enquete</legend>
      <Button type="button" variant="link" size="36" className="absolute top-3.5 right-3.5 h-9 text-[13px] text-muted hover:text-text" onClick={onRemover}>
        Remover enquete
      </Button>
      <Campo rotulo="Pergunta" tamanho="42" maxLength={200} value={enquete.pergunta} onChange={(e) => onMudar({ ...enquete, pergunta: e.target.value })} placeholder="Ex.: Qual tema para a próxima mentoria?" />
      {enquete.opcoes.map((o, i) => (
        <div key={i} className="flex items-end gap-2">
          <Campo rotulo={`Opção ${i + 1}`} rotuloOculto={i > 0} tamanho="42" maxLength={80} value={o} onChange={(e) => mudarOpcao(i, e.target.value)} placeholder={`Opção ${i + 1}`} classNameMoldura="flex-1" />
          {enquete.opcoes.length > ENQUETE_OPCOES_MIN && (
            <Button type="button" variant="fantasma" size="icone36" aria-label={`Remover opção ${i + 1}`} className="mb-[3px] text-muted" onClick={() => onMudar({ ...enquete, opcoes: enquete.opcoes.filter((_, j) => j !== i) })}>
              <X aria-hidden />
            </Button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Button type="button" variant="contorno" size="36" disabled={enquete.opcoes.length >= ENQUETE_OPCOES_MAX} onClick={() => onMudar({ ...enquete, opcoes: [...enquete.opcoes, ""] })}>
          <Plus aria-hidden className="size-3.5" />
          Adicionar opção
        </Button>
        <Campo rotulo="Encerra em (opcional)" type="datetime-local" tamanho="36" min={agora} value={enquete.encerraEm} onChange={(e) => onMudar({ ...enquete, encerraEm: e.target.value })} classNameMoldura="w-[220px]" />
      </div>
    </fieldset>
  );
}
