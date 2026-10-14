"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import type { Resultado } from "@/lib/acao";
import { acaoAlterarSituacaoTrilha, acaoRemoverTrilha } from "@/lib/actions/trilhas";
import type { StatusTrilha } from "@/lib/db/schema/_enums";

export interface TrilhaAcionavel {
  id: string;
  titulo: string;
  status: StatusTrilha;
  etapas: number;
  /** `updated_at` ISO (trava). */
  versao: string;
}

/**
 * Publicar/despublicar e remover a trilha, sempre pelo modal block (3 s). Usado no menu da lista e
 * no painel do editor. Remover leva de volta à lista (`aoRemover`).
 */
export function useAcoesTrilha(t: TrilhaAcionavel, aoRemover?: string) {
  const router = useRouter();
  const [aberto, setAberto] = useState<"situacao" | "remover" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const publicada = t.status === "PUBLICADA";

  const rodar = (acao: () => Promise<Resultado<unknown>>, depois: () => void) =>
    iniciar(async () => {
      const r = await acao().catch(() => null);
      setAberto(null);
      if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
      if (!r.ok) return setErro(r.erro);
      setErro(null);
      depois();
    });

  const modais = (
    <>
      <ModalConfirmacaoBlock
        aberto={aberto === "situacao"}
        titulo={publicada ? "Despublicar trilha" : "Publicar trilha"}
        mensagem={
          publicada
            ? `"${t.titulo}" sai da tela Trilhas e da vitrine dos alunos. As etapas e o progresso de cada aluno continuam guardados.`
            : `"${t.titulo}" (${t.etapas} ${t.etapas === 1 ? "etapa" : "etapas"}) aparece para quem tem matrícula em ao menos um curso dela, na tela Trilhas e na vitrine.`
        }
        textoConfirmar={publicada ? "Despublicar" : "Publicar"}
        carregando={pendente}
        onCancelar={() => setAberto(null)}
        onConfirmar={() =>
          rodar(
            () => acaoAlterarSituacaoTrilha({ trilhaId: t.id, versao: t.versao, status: publicada ? "RASCUNHO" : "PUBLICADA" }),
            () => router.refresh(),
          )
        }
      />
      <ModalConfirmacaoBlock
        aberto={aberto === "remover"}
        titulo="Remover trilha"
        mensagem={`Remover "${t.titulo}" e as ${t.etapas} ${t.etapas === 1 ? "etapa" : "etapas"} dela. Os cursos e avaliações não são afetados. A remoção fica na trilha de auditoria.`}
        textoConfirmar="Remover"
        carregando={pendente}
        onCancelar={() => setAberto(null)}
        onConfirmar={() =>
          rodar(
            () => acaoRemoverTrilha({ trilhaId: t.id, versao: t.versao }),
            () => (aoRemover ? router.push(aoRemover) : router.refresh()),
          )
        }
      />
    </>
  );

  return { publicada, pendente, erro, setErro, abrirSituacao: () => setAberto("situacao"), abrirRemover: () => setAberto("remover"), modais };
}
