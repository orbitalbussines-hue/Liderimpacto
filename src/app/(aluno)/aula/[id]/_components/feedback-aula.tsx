"use client";

import { useState, useTransition } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { AreaTexto } from "@/components/ui/area-texto";
import { Button } from "@/components/ui/button";
import { acaoDarFeedback, acaoRemoverFeedback } from "@/lib/actions/feedbacks";
import { cn } from "@/lib/utils";

export interface FeedbackAulaProps {
  aulaId: string;
  inicial: { util: boolean; comentario: string | null } | null;
  /** Equipe na prévia: botões desligados (só ALUNO avalia, RN-202). */
  somenteLeitura?: boolean;
}

/** Igual ao limite de `comentarioFeedbackSchema`; a action confere de novo. */
const MAX = 500;

/**
 * "Esta aula foi útil?" (RN-202): um clique grava; clicar de novo na escolha marcada tira a
 * avaliação. Comentário opcional abre só depois de avaliar. A regra (só ALUNO com acesso) mora
 * na action; aqui é só a tela.
 */
export function FeedbackAula({ aulaId, inicial, somenteLeitura = false }: FeedbackAulaProps) {
  const [atual, setAtual] = useState(inicial);
  const [comentando, setComentando] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const gravar = (util: boolean, comentario: string | null) =>
    iniciar(async () => {
      const r = await acaoDarFeedback({ aulaId, util, comentario });
      if (!r.ok) return setMensagem({ tom: "erro", texto: r.erro });
      setAtual({ util, comentario: comentario?.trim() || null });
      setComentando(null);
      setMensagem({ tom: "ok", texto: "Obrigado! Sua avaliação foi registrada." });
    });

  const clicar = (util: boolean) => {
    if (atual?.util !== util) return gravar(util, atual?.comentario ?? null);
    iniciar(async () => {
      const r = await acaoRemoverFeedback({ aulaId });
      if (!r.ok) return setMensagem({ tom: "erro", texto: r.erro });
      setAtual(null);
      setComentando(null);
      setMensagem({ tom: "ok", texto: "Avaliação retirada." });
    });
  };

  const opcao = (util: boolean) => {
    const marcado = atual?.util === util;
    const Icone = util ? ThumbsUp : ThumbsDown;
    return (
      <Button
        type="button"
        variant="contorno"
        size="36"
        pilula
        aria-pressed={marcado}
        disabled={somenteLeitura || pendente}
        title={marcado ? "Clique de novo para tirar a avaliação" : undefined}
        onClick={() => clicar(util)}
        className={cn(marcado && "border-accent bg-accent-soft text-accent hover:bg-accent-soft")}
      >
        <Icone aria-hidden className={cn("size-3.5", marcado && "fill-current")} />
        {util ? "Útil" : "Não útil"}
      </Button>
    );
  };

  return (
    <section aria-labelledby={`feedback-${aulaId}`} className="flex max-w-[760px] flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id={`feedback-${aulaId}`} className="m-0 font-sans text-sm font-semibold tracking-normal text-muted">
          Esta aula foi útil?
        </h2>
        <div className="flex gap-2" role="group" aria-labelledby={`feedback-${aulaId}`}>
          {opcao(true)}
          {opcao(false)}
        </div>
        {atual && comentando === null && !somenteLeitura && (
          <Button type="button" variant="link" size="36" className="text-[13px]" onClick={() => {
              setMensagem(null);
              setComentando(atual.comentario ?? "");
            }}>
            {atual.comentario ? "Editar comentário" : "Deixar um comentário"}
          </Button>
        )}
      </div>

      {somenteLeitura && <p className="m-0 text-[13px] text-muted">Só alunos avaliam as aulas. Na prévia da equipe, os botões ficam desligados.</p>}

      {atual?.comentario && comentando === null && <p className="m-0 text-[13px] leading-relaxed break-words whitespace-pre-line text-muted">“{atual.comentario}”</p>}

      {atual && comentando !== null && (
        <form
          className="flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            gravar(atual.util, comentando);
          }}
        >
          <AreaTexto
            rotulo="Comentário (opcional)"
            value={comentando}
            onChange={(e) => setComentando(e.target.value)}
            maxLength={MAX}
            rows={3}
            autoFocus
            placeholder={atual.util ? "O que mais ajudou nesta aula?" : "O que poderia ser melhor nesta aula?"}
            ajuda={`${comentando.length} de ${MAX} caracteres. A equipe do curso lê, sem mostrar a outros alunos.`}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="36" carregando={pendente}>
              Enviar comentário
            </Button>
            <Button type="button" variant="fantasma" size="36" onClick={() => setComentando(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      <p role={mensagem?.tom === "erro" ? "alert" : "status"} className={cn("m-0 text-[13px]", mensagem?.tom === "erro" ? "text-warn" : "text-muted", !mensagem && "sr-only")}>
        {mensagem?.texto}
      </p>
    </section>
  );
}
