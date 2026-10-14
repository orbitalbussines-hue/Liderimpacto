"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import type { Resultado } from "@/lib/acao";
import { acaoEncerrarDesafio, acaoExcluirDesafio, acaoPublicarDesafio } from "@/lib/actions/gamificacao";
import type { SituacaoDesafio } from "@/lib/db/schema/_enums";

export interface DesafioAcionavel {
  id: string;
  titulo: string;
  situacao: SituacaoDesafio;
  participantes: number;
  /** `updated_at` ISO (trava). */
  versao: string;
}

type Acao = "publicar" | "encerrar" | "excluir";

/**
 * Publicar, encerrar e excluir rascunho, sempre pelo modal block (3 s). Usado no menu da lista e no
 * painel do editor. Excluir leva de volta à lista (`aoExcluir`).
 */
export function useAcoesDesafio(d: DesafioAcionavel, aoExcluir?: string) {
  const router = useRouter();
  const [aberto, setAberto] = useState<Acao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const rodar = (acao: () => Promise<Resultado<unknown>>, depois: () => void) =>
    iniciar(async () => {
      const r = await acao().catch(() => null);
      setAberto(null);
      if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
      if (!r.ok) return setErro(r.erro);
      setErro(null);
      depois();
    });

  const alvo = { desafioId: d.id, versao: d.versao };
  const pessoas = `${d.participantes} ${d.participantes === 1 ? "participante" : "participantes"}`;
  const textos: Record<Acao, { titulo: string; mensagem: string; botao: string }> = {
    publicar: {
      titulo: "Publicar desafio",
      mensagem: `"${d.titulo}" passa a aparecer em Conquistas para o público escolhido, que pode clicar em Participar até o fim. Depois de publicado ele não pode ser excluído, só encerrado.`,
      botao: "Publicar",
    },
    encerrar: {
      titulo: "Encerrar desafio",
      mensagem: `"${d.titulo}" para agora (${pessoas}). Quem ainda não alcançou a meta não conclui mais; quem concluiu mantém o bônus e a recompensa. Não dá para reabrir.`,
      botao: "Encerrar",
    },
    excluir: {
      titulo: "Excluir rascunho",
      mensagem: `"${d.titulo}" sai da lista (exclusão lógica, fica na trilha de auditoria). Nenhum aluno chegou a ver este rascunho.`,
      botao: "Excluir",
    },
  };
  const executa: Record<Acao, () => Promise<Resultado<unknown>>> = {
    publicar: () => acaoPublicarDesafio(alvo),
    encerrar: () => acaoEncerrarDesafio(alvo),
    excluir: () => acaoExcluirDesafio(alvo),
  };

  const modais = (["publicar", "encerrar", "excluir"] as const).map((a) => (
    <ModalConfirmacaoBlock
      key={a}
      aberto={aberto === a}
      titulo={textos[a].titulo}
      mensagem={textos[a].mensagem}
      textoConfirmar={textos[a].botao}
      carregando={pendente}
      onCancelar={() => setAberto(null)}
      onConfirmar={() => rodar(executa[a], () => (a === "excluir" && aoExcluir ? router.push(aoExcluir) : router.refresh()))}
    />
  ));

  return {
    pendente,
    erro,
    setErro,
    podePublicar: d.situacao === "RASCUNHO",
    podeEncerrar: d.situacao === "PUBLICADO",
    podeExcluir: d.situacao === "RASCUNHO",
    abrir: (a: Acao) => setAberto(a),
    modais,
  };
}
