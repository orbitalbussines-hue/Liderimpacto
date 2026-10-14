"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { CartaoTitulo } from "@/components/ui/cartao";
import { acaoAlterarSituacaoAvaliacao } from "@/lib/actions/avaliacoes";
import type { StatusAvaliacao } from "@/lib/db/schema/_enums";

export interface SituacaoAvaliacaoProps {
  avaliacao: { id: string; titulo: string; status: StatusAvaliacao; versao: string };
  /** O que IMPEDE publicar (a action recusa igual). */
  pendencias: string[];
  /** O que não impede, mas o aluno ainda não vai ver (curso/módulo em rascunho). */
  observacoes: string[];
}

/** Publicar (exige ≥ 1 questão) ou voltar para rascunho, pelo modal block. */
export function SituacaoAvaliacao({ avaliacao, pendencias, observacoes }: SituacaoAvaliacaoProps) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const publicada = avaliacao.status === "PUBLICADA";
  const destino: StatusAvaliacao = publicada ? "RASCUNHO" : "PUBLICADA";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <CartaoTitulo tamanho={15} como="h2">
          Situação
        </CartaoTitulo>
        <p className="m-0 mt-1 text-[13px] text-muted">
          {publicada ? "Publicada: os alunos matriculados veem e respondem." : "Rascunho: só a equipe vê. Publique quando as questões estiverem prontas."}
        </p>
      </div>
      {!publicada && pendencias.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-2 p-3 text-[13px]" role="status">
          <b>Para publicar, falta:</b>
          <ul className="m-0 mt-1 list-disc pl-5">
            {pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {observacoes.map((o) => (
        <Aviso key={o}>{o}</Aviso>
      ))}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Button
        size="42"
        variant={publicada ? "contorno" : "primario"}
        disabled={!publicada && pendencias.length > 0}
        onClick={() => {
          setErro(null);
          setConfirmando(true);
        }}
        className="self-start"
      >
        {publicada ? "Voltar para rascunho" : "Publicar avaliação"}
      </Button>
      <ModalConfirmacaoBlock
        aberto={confirmando}
        titulo={publicada ? "Voltar para rascunho" : "Publicar avaliação"}
        mensagem={
          publicada
            ? `"${avaliacao.titulo}" some da tela dos alunos. Tentativas em andamento ficam abertas e as já feitas continuam no histórico.`
            : `"${avaliacao.titulo}" passa a aparecer para os alunos matriculados no curso. A mudança fica registrada na trilha.`
        }
        textoConfirmar={publicada ? "Voltar para rascunho" : "Publicar"}
        carregando={pendente}
        onCancelar={() => setConfirmando(false)}
        onConfirmar={() =>
          iniciar(async () => {
            const r = await acaoAlterarSituacaoAvaliacao({ avaliacaoId: avaliacao.id, versao: avaliacao.versao, status: destino });
            setConfirmando(false);
            if (!r.ok) return setErro(r.erro);
            router.refresh();
          })
        }
      />
    </div>
  );
}
