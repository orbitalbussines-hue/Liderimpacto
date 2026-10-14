"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Timer } from "lucide-react";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { acaoFinalizarTentativa, acaoResponder } from "@/lib/actions/avaliacoes-aluno";
import type { QuestaoParaResponder } from "@/lib/avaliacoes/consultas";
import { IDS_OPCOES, ROTULO_TIPO_QUESTAO } from "@/lib/avaliacoes/regras";
import { cn } from "@/lib/utils";
import { relogio } from "./formatos";

export interface ResponderTentativaProps {
  avaliacao: { id: string; titulo: string };
  tentativa: { id: string; numero: number; segundosRestantes: number | null };
  questoes: QuestaoParaResponder[];
}

type Respostas = Record<string, string[]>;
const respondida = (r: Respostas, id: string) => (r[id]?.length ?? 0) > 0;

/** Cronômetro a partir do que o SERVIDOR mandou; ao zerar avisa uma vez (`onZerar`). */
function useCronometro(segundosRestantes: number | null, onZerar: () => void) {
  const [restante, setRestante] = useState(segundosRestantes);
  const zerar = useRef(onZerar);
  useEffect(() => {
    zerar.current = onZerar;
  });
  useEffect(() => {
    if (segundosRestantes === null) return;
    const fim = Date.now() + segundosRestantes * 1000;
    let avisou = false;
    const tick = () => {
      const s = Math.max(0, Math.ceil((fim - Date.now()) / 1000));
      setRestante(s);
      if (s === 0 && !avisou) {
        avisou = true;
        zerar.current();
      }
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [segundosRestantes]);
  return restante;
}

/**
 * Tela de responder (uma questão por vez + mapa das questões). Cada clique grava na hora
 * (`acaoResponder`) de forma otimista, em fila (a ordem dos cliques é a ordem no servidor); se a
 * gravação falha, a marcação volta à última confirmada. O prazo é do servidor: ao zerar, a página
 * é recarregada e o servidor fecha a tentativa e leva ao resultado. Nada de gabarito aqui.
 */
export function ResponderTentativa({ avaliacao, tentativa, questoes }: ResponderTentativaProps) {
  const router = useRouter();
  const inicial = Object.fromEntries(questoes.map((q) => [q.id, q.resposta]));
  const [respostas, setRespostas] = useState<Respostas>(inicial);
  const [atual, setAtual] = useState(() => Math.max(0, questoes.findIndex((q) => q.resposta.length === 0)));
  const [pendentes, setPendentes] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [esgotado, setEsgotado] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [enviando, iniciar] = useTransition();
  const fila = useRef<Promise<void>>(Promise.resolve());
  const confirmadas = useRef<Respostas>(inicial);
  const ultimo = useRef<Record<string, number>>({});
  const contador = useRef(0);
  const topoQuestao = useRef<HTMLDivElement>(null);
  const primeiraRender = useRef(true);
  const resultado = `/avaliacoes/${avaliacao.id}/resultado/${tentativa.id}`;

  const restante = useCronometro(tentativa.segundosRestantes, () => {
    setEsgotado(true);
    router.refresh();
  });
  // Esgotado: o servidor fecha a tentativa e a página redireciona; insiste caso o relógio local adiante.
  useEffect(() => {
    if (!esgotado) return;
    const id = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(id);
  }, [esgotado, router]);
  // Trocou de questão: o foco vai para o enunciado (leitor de tela e teclado).
  useEffect(() => {
    if (primeiraRender.current) {
      primeiraRender.current = false;
      return;
    }
    topoQuestao.current?.focus();
  }, [atual]);

  const salvar = (questaoId: string, opcoes: string[]) => {
    const seq = ++contador.current;
    ultimo.current[questaoId] = seq;
    setRespostas((r) => ({ ...r, [questaoId]: opcoes }));
    setErro(null);
    setPendentes((n) => n + 1);
    const voltar = (mensagem: string) => {
      // Só a gravação mais recente da questão decide o que fica na tela.
      if (ultimo.current[questaoId] === seq) setRespostas((r) => ({ ...r, [questaoId]: confirmadas.current[questaoId] ?? [] }));
      setErro(mensagem);
    };
    fila.current = fila.current.then(async () => {
      try {
        const r = await acaoResponder({ tentativaId: tentativa.id, questaoId, opcoes });
        if (!r.ok) return voltar(r.erro);
        if (r.dados.situacao === "encerrada") {
          setEsgotado(true);
          router.refresh();
          return;
        }
        confirmadas.current = { ...confirmadas.current, [questaoId]: opcoes };
      } catch {
        voltar("Sem conexão: a última marcação não foi salva. Tente de novo.");
      } finally {
        setPendentes((n) => n - 1);
      }
    });
  };

  const total = questoes.length;
  const feitas = questoes.filter((q) => respondida(respostas, q.id)).length;
  const faltam = total - feitas;
  const q = questoes[atual];
  const marcadas = respostas[q.id] ?? [];
  const multipla = q.tipo === "MULTIPLA";
  const travado = esgotado || enviando;
  const pouco = restante !== null && restante <= 60;

  const finalizar = () =>
    iniciar(async () => {
      await fila.current;
      const r = await acaoFinalizarTentativa({ tentativaId: tentativa.id });
      if (!r.ok) {
        setFinalizando(false);
        return setErro(r.erro);
      }
      router.push(resultado);
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="sticky top-[68px] z-10 flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 desk:px-5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{avaliacao.titulo}</div>
          <div className="text-xs text-muted">
            Tentativa {tentativa.numero} · {feitas} de {total} respondidas
          </div>
        </div>
        {restante !== null && (
          <div
            className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums", pouco ? "bg-warn-soft text-warn" : "bg-surface-2 text-text")}
            role="timer"
            aria-label={`Tempo restante: ${relogio(restante)}`}
          >
            <Timer className="size-4" aria-hidden />
            {relogio(restante)}
          </div>
        )}
        <Button size="40" disabled={travado} onClick={() => setFinalizando(true)}>
          Finalizar
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {restante === 300 ? "Faltam 5 minutos." : restante === 60 ? "Falta 1 minuto." : ""}
      </p>

      {esgotado && <Aviso tom="erro">Tempo esgotado. Corrigindo com o que você já respondeu e levando ao resultado…</Aviso>}

      <div className="grid items-start gap-5 desk:grid-cols-[minmax(0,1fr)_280px]">
        <Cartao padding={24} como="section" aria-label={`Questão ${q.numero} de ${total}`} className="flex flex-col gap-5">
          <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" disabled={esgotado}>
            <legend className="mb-4 w-full p-0">
              <div ref={topoQuestao} tabIndex={-1} className="outline-none">
                <span className="text-xs font-bold tracking-[.12em] text-accent uppercase">
                  Questão {q.numero} de {total}
                </span>
                <span className="mt-1 block text-xs text-muted">
                  {ROTULO_TIPO_QUESTAO[q.tipo]}
                  {multipla ? " · marque todas as corretas" : " · marque uma opção"}
                  {q.peso > 1 && ` · peso ${q.peso}`}
                </span>
                <span className="mt-3 block text-[17px] leading-relaxed font-semibold whitespace-pre-line text-text">{q.enunciado}</span>
              </div>
            </legend>
            {q.opcoes.map((o, i) => {
              const marcada = marcadas.includes(o.id);
              return (
                <label
                  key={o.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 text-sm leading-relaxed transition-colors has-focus-visible:ring-3 has-focus-visible:ring-accent/30",
                    marcada ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2",
                  )}
                >
                  <input
                    type={multipla ? "checkbox" : "radio"}
                    name={`questao-${q.id}`}
                    value={o.id}
                    checked={marcada}
                    onChange={(e) => salvar(q.id, multipla ? (e.target.checked ? [...marcadas, o.id] : marcadas.filter((x) => x !== o.id)) : [o.id])}
                    className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-accent"
                  />
                  <span aria-hidden className="w-4 shrink-0 font-bold text-muted uppercase">
                    {IDS_OPCOES[i]}
                  </span>
                  <span className="min-w-0 flex-1">{o.texto}</span>
                </label>
              );
            })}
          </fieldset>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <Button variant="contorno" disabled={atual === 0} onClick={() => setAtual(atual - 1)}>
              <ArrowLeft aria-hidden />
              Anterior
            </Button>
            <span className="text-xs text-muted" aria-live="polite">
              {pendentes > 0 ? "Salvando…" : "Salvo"}
            </span>
            {atual < total - 1 ? (
              <Button variant="contorno" onClick={() => setAtual(atual + 1)}>
                Próxima
                <ArrowRight aria-hidden />
              </Button>
            ) : (
              <Button disabled={travado} onClick={() => setFinalizando(true)}>
                Finalizar
              </Button>
            )}
          </div>
        </Cartao>

        <Cartao padding={20} como="aside" aria-label="Mapa das questões">
          <CartaoTitulo tamanho={14} como="h2">
            Questões
          </CartaoTitulo>
          <p className="m-0 mt-1 text-xs text-muted">{faltam === 0 ? "Todas respondidas." : `${faltam} sem resposta.`}</p>
          <nav aria-label="Ir para a questão" className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(40px,1fr))] gap-1.5">
            {questoes.map((x, i) => {
              const ok = respondida(respostas, x.id);
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setAtual(i)}
                  aria-current={i === atual ? "step" : undefined}
                  aria-label={`Questão ${x.numero}, ${ok ? "respondida" : "sem resposta"}`}
                  className={cn(
                    "grid h-10 cursor-pointer place-items-center rounded-lg border text-[13px] font-bold tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-accent/40",
                    ok ? "border-transparent bg-accent-soft text-accent" : "border-border text-muted hover:bg-surface-2",
                    i === atual && "border-accent text-text",
                  )}
                >
                  {x.numero}
                </button>
              );
            })}
          </nav>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-sm bg-accent-soft ring-1 ring-accent/40" />
              Respondida
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-sm ring-1 ring-border" />
              Sem resposta
            </span>
          </div>
        </Cartao>
      </div>

      <ModalConfirmacaoBlock
        aberto={finalizando}
        titulo="Finalizar tentativa"
        mensagem={
          faltam > 0
            ? `Você respondeu ${feitas} de ${total}. ${faltam === 1 ? "1 questão sem resposta conta" : `${faltam} questões sem resposta contam`} como errada${faltam === 1 ? "" : "s"}. Depois de finalizar, as respostas não mudam mais.`
            : `Você respondeu todas as ${total} questões. Depois de finalizar, as respostas não mudam mais.`
        }
        textoConfirmar="Finalizar e corrigir"
        carregando={enviando}
        onCancelar={() => setFinalizando(false)}
        onConfirmar={finalizar}
      />
    </div>
  );
}
