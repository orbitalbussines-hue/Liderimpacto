"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Plus, Square } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { LIMITES_ASSISTENTE } from "@/lib/assistente/regras";
import type { FonteMensagem } from "@/lib/db/schema/assistente";
import { cn } from "@/lib/utils";
import { RespostaAssistente } from "./resposta-assistente";
import { perguntarAoAssistente, type EventoChat, type PedidoChat } from "./stream";

export interface MensagemChat {
  id: string;
  papel: "USUARIO" | "ASSISTENTE";
  texto: string;
  fontes: FonteMensagem[];
}

export interface ConversaChat {
  conversaId: string;
  versao: string;
  mensagens: MensagemChat[];
}

export interface ChatAssistenteProps {
  nomeAssistente: string;
  inicial: ConversaChat | null;
  /** Painel da aula: a conversa nasce ligada à aula. */
  aulaId?: string | null;
  /** Playground da equipe ("Testar"). */
  teste?: boolean;
  /** Motivo de não poder perguntar (IA não configurada, desligado): o histórico continua visível. */
  indisponivel?: string | null;
  /** Conteúdo do estado vazio (sem mensagens). */
  vazio?: ReactNode;
  /** Mostrar o aviso de privacidade (alunos). */
  avisoPrivacidade?: boolean;
  /** Botão "Nova conversa" acima das mensagens (a página do histórico tem o seu). */
  mostrarNova?: boolean;
  /** A conversa ganhou id/versão nova (a página do histórico troca a URL). `null` = nova conversa. */
  onConversa?: (c: { conversaId: string; versao: string } | null) => void;
  /** Envio (padrão: `POST /api/assistente`); o teste injeta um falso. */
  enviar?: (pedido: PedidoChat, aoEvento: (e: EventoChat) => void, sinal: AbortSignal) => Promise<void>;
  className?: string;
}

interface EmAndamento {
  pergunta: string;
  texto: string;
  fontes: FonteMensagem[];
}

/**
 * Conversa com o assistente (ADR-0014): pergunta, resposta em STREAMING (texto puro renderizado por
 * `RespostaAssistente`), fontes com link para a aula no ponto citado, "Parar", "Nova conversa".
 * Enter envia; Shift+Enter quebra a linha. Sair da tela aborta a resposta (o servidor grava o que chegou).
 */
export function ChatAssistente(p: ChatAssistenteProps) {
  const enviar = p.enviar ?? perguntarAoAssistente;
  const [conversa, setConversa] = useState<{ id: string; versao: string } | null>(p.inicial ? { id: p.inicial.conversaId, versao: p.inicial.versao } : null);
  const [mensagens, setMensagens] = useState<MensagemChat[]>(p.inicial?.mensagens ?? []);
  const [andamento, setAndamento] = useState<EmAndamento | null>(null);
  const [pergunta, setPergunta] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [restantes, setRestantes] = useState<number | null>(null);
  const controle = useRef<AbortController | null>(null);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => () => controle.current?.abort(), []);
  // Acompanha a resposta chegando (não rola a página ao abrir uma conversa antiga).
  const montou = useRef(false);
  useEffect(() => {
    if (montou.current) fim.current?.scrollIntoView?.({ block: "nearest" });
    montou.current = true;
  }, [mensagens.length, andamento?.texto]);

  const ocupado = andamento !== null;
  const podeEnviar = !p.indisponivel && !ocupado && pergunta.trim().length >= 2;

  async function perguntar() {
    const texto = pergunta.trim();
    if (!podeEnviar) return;
    setErro(null);
    setPergunta("");
    const c = new AbortController();
    controle.current = c;
    let atual: EmAndamento = { pergunta: texto, texto: "", fontes: [] };
    let conversaId = conversa?.id ?? null;
    setAndamento(atual);
    await enviar({ pergunta: texto, conversaId, aulaId: p.aulaId ?? null, teste: !!p.teste }, (e) => {
      if (e.tipo === "inicio") {
        conversaId = e.conversaId;
        setRestantes(e.restantes);
        atual = { ...atual, fontes: e.fontes };
      } else if (e.tipo === "texto") atual = { ...atual, texto: atual.texto + e.texto };
      else if (e.tipo === "substituir") atual = { ...atual, texto: e.texto };
      else if (e.tipo === "erro") {
        setErro(e.mensagem);
        // Recusado antes de começar (limite, desligado): a pergunta volta para o campo.
        if (!conversaId || !atual.fontes.length) setPergunta((v) => v || texto);
      } else {
        const fontes = atual.fontes.filter((f) => e.citadas.includes(f.n));
        const resposta = atual.texto;
        setMensagens((m) => [
          ...m,
          { id: `${e.mensagemId}-p`, papel: "USUARIO", texto, fontes: [] },
          { id: e.mensagemId, papel: "ASSISTENTE", texto: resposta, fontes },
        ]);
        const nova = { id: conversaId!, versao: e.versao };
        setConversa(nova);
        p.onConversa?.({ conversaId: nova.id, versao: nova.versao });
        atual = { ...atual, texto: "" };
        setAndamento(null);
        return;
      }
      setAndamento(atual);
    }, c.signal);
    // Parou no meio ou deu erro: o que chegou fica na tela como resposta interrompida.
    setAndamento((a) => {
      if (a && a.texto) setMensagens((m) => [...m, { id: `p-${m.length}`, papel: "USUARIO", texto: a.pergunta, fontes: [] }, { id: `r-${m.length}`, papel: "ASSISTENTE", texto: a.texto, fontes: [] }]);
      return null;
    });
    if (conversaId && conversaId !== conversa?.id) setConversa((v) => v ?? { id: conversaId!, versao: "" });
  }

  function novaConversa() {
    controle.current?.abort();
    setConversa(null);
    setMensagens([]);
    setAndamento(null);
    setErro(null);
    p.onConversa?.(null);
  }

  const vazio = !mensagens.length && !andamento;
  return (
    <section aria-label={`Conversa com ${p.nomeAssistente}`} className={cn("flex min-h-0 flex-col gap-3", p.className)}>
      {p.mostrarNova !== false && (conversa || mensagens.length > 0) && (
        <div className="flex justify-end">
          <Button type="button" variant="fantasma" size="36" onClick={novaConversa}>
            <Plus aria-hidden />
            Nova conversa
          </Button>
        </div>
      )}
      <div role="log" aria-live="polite" aria-busy={ocupado} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        {vazio && (p.vazio ?? <p className="m-0 text-sm text-muted">Pergunte sobre o conteúdo das aulas. As respostas citam a aula e o minuto de onde vieram.</p>)}
        {mensagens.map((m) =>
          m.papel === "USUARIO" ? (
            <BalaoPergunta key={m.id} texto={m.texto} />
          ) : (
            <BlocoResposta key={m.id} nome={p.nomeAssistente}>
              <RespostaAssistente texto={m.texto} fontes={m.fontes} />
            </BlocoResposta>
          ),
        )}
        {andamento && (
          <>
            <BalaoPergunta texto={andamento.pergunta} />
            <BlocoResposta nome={p.nomeAssistente}>
              {andamento.texto ? (
                <RespostaAssistente texto={andamento.texto} fontes={andamento.fontes} mostrarFontes={false} />
              ) : (
                <p className="m-0 text-sm text-muted">Consultando as aulas…</p>
              )}
            </BlocoResposta>
          </>
        )}
        <div ref={fim} />
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {p.indisponivel ? (
        <Aviso tom="info">{p.indisponivel}</Aviso>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void perguntar();
          }}
        >
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 focus-within:border-accent">
            <label htmlFor="pergunta-assistente" className="sr-only">
              Sua pergunta
            </label>
            <textarea
              id="pergunta-assistente"
              rows={2}
              value={pergunta}
              maxLength={LIMITES_ASSISTENTE.pergunta}
              placeholder="Escreva sua dúvida sobre as aulas"
              className="max-h-40 min-h-11 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-[14.5px] leading-relaxed text-text outline-none placeholder:text-muted"
              onChange={(e) => setPergunta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void perguntar();
                }
              }}
            />
            {ocupado ? (
              <Button type="button" variant="secundario" size="icone44" aria-label="Parar a resposta" onClick={() => controle.current?.abort()}>
                <Square aria-hidden className="fill-current" />
              </Button>
            ) : (
              <Button type="submit" size="icone44" aria-label="Enviar pergunta" disabled={!podeEnviar}>
                <ArrowUp aria-hidden />
              </Button>
            )}
          </div>
          <p className="m-0 flex flex-wrap justify-between gap-x-3 gap-y-1 px-1 text-xs text-muted">
            <span>{p.avisoPrivacidade ? "Suas perguntas podem ser lidas pela equipe para melhorar o curso." : "Enter envia · Shift+Enter quebra a linha"}</span>
            {restantes !== null && <span>{restantes === 1 ? "1 pergunta restante hoje" : `${restantes} perguntas restantes hoje`}</span>}
          </p>
        </form>
      )}
    </section>
  );
}

function BalaoPergunta({ texto }: { texto: string }) {
  return (
    <div className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-surface-2 px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-line">
      <span className="sr-only">Você: </span>
      {texto}
    </div>
  );
}

function BlocoResposta({ nome, children }: { nome: string; children: ReactNode }) {
  return (
    <div className="flex max-w-[92%] flex-col gap-1.5">
      <p className="m-0 text-xs font-bold text-muted">{nome}</p>
      {children}
    </div>
  );
}
