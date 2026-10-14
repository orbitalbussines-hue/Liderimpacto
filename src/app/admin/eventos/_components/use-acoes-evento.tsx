"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import type { Resultado } from "@/lib/acao";
import { acaoCancelarEvento, acaoExcluirEvento, acaoPublicarEvento } from "@/lib/actions/eventos";
import type { SituacaoEvento } from "@/lib/db/schema/_enums";

export interface EventoAcionavel {
  id: string;
  titulo: string;
  situacao: SituacaoEvento;
  /** "21/10 às 19:30". */
  quando: string;
  /** Texto do público ("Todos os alunos", "Alunos de Liderança 360"). */
  publico: string;
  inscritos: number;
  /** Já terminou (não publica nem cancela). */
  encerrado: boolean;
  /** `updated_at` ISO (trava). */
  versao: string;
}

type Modal = "publicar" | "cancelar" | "excluir";

const pessoas = (n: number) => (n === 1 ? "1 pessoa confirmou presença e recebe" : `${n} pessoas confirmaram presença e recebem`);

/**
 * Publicar, cancelar e excluir (rascunho), sempre pelo modal block (3 s): publicar e cancelar avisam
 * gente. Usado no menu da lista e no painel do editor. Excluir leva de volta à lista (`aoExcluir`).
 */
export function useAcoesEvento(e: EventoAcionavel, aoExcluir?: string) {
  const router = useRouter();
  const [aberto, setAberto] = useState<Modal | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const rodar = (acao: () => Promise<Resultado<{ versao: string; lembreteEnfileirado?: boolean | null } | null>>, depois: () => void) =>
    iniciar(async () => {
      const r = await acao().catch(() => null);
      setAberto(null);
      if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
      if (!r.ok) return setErro(r.erro);
      setErro(null);
      setAviso(r.dados?.lembreteEnfileirado === false ? "Publicado. O lembrete de 1 h antes fica agendado assim que a fila voltar." : null);
      depois();
    });

  const comum = { carregando: pendente, onCancelar: () => setAberto(null) };
  const modais = (
    <>
      <ModalConfirmacaoBlock
        {...comum}
        aberto={aberto === "publicar"}
        titulo="Publicar encontro"
        mensagem={`"${e.titulo}" (${e.quando}) aparece para o público escolhido (${e.publico}) e cada aluno recebe um aviso no sino. Quem confirmar presença recebe um lembrete 1 hora antes.`}
        textoConfirmar="Publicar e avisar"
        onConfirmar={() => rodar(() => acaoPublicarEvento({ eventoId: e.id, versao: e.versao }), () => router.refresh())}
      />
      <ModalConfirmacaoBlock
        {...comum}
        aberto={aberto === "cancelar"}
        titulo="Cancelar encontro"
        mensagem={`"${e.titulo}" (${e.quando}) fica marcado como cancelado, sem link. ${e.inscritos ? `${pessoas(e.inscritos)} o aviso no sino.` : "Ninguém confirmou presença ainda."} Não dá para desfazer.`}
        textoConfirmar="Cancelar encontro"
        onConfirmar={() => rodar(() => acaoCancelarEvento({ eventoId: e.id, versao: e.versao }), () => router.refresh())}
      />
      <ModalConfirmacaoBlock
        {...comum}
        aberto={aberto === "excluir"}
        titulo="Excluir rascunho"
        mensagem={`O rascunho "${e.titulo}" sai da lista. Nenhum aluno chegou a vê-lo. A exclusão fica na trilha de auditoria.`}
        textoConfirmar="Excluir"
        onConfirmar={() => rodar(() => acaoExcluirEvento({ eventoId: e.id, versao: e.versao }), () => (aoExcluir ? router.push(aoExcluir) : router.refresh()))}
      />
    </>
  );

  const abrir = (m: Modal) => () => setAberto(m);
  return {
    podePublicar: e.situacao === "RASCUNHO" && !e.encerrado,
    podeCancelar: e.situacao === "PUBLICADO" && !e.encerrado,
    podeExcluir: e.situacao === "RASCUNHO",
    pendente,
    erro,
    setErro,
    aviso,
    abrirPublicar: abrir("publicar"),
    abrirCancelar: abrir("cancelar"),
    abrirExcluir: abrir("excluir"),
    modais,
  };
}
