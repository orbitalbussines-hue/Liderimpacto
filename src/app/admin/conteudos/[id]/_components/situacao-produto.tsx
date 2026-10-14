"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { CampoMoldura } from "@/components/ui/campo-moldura";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { acaoAlterarSituacaoProduto } from "@/lib/actions/produtos";
import { ROTULO_STATUS_PRODUTO } from "@/lib/catalogo/regras";
import { STATUS_PRODUTO, type StatusProduto } from "@/lib/db/schema/_enums";

export interface SituacaoProdutoProps {
  produto: { id: string; titulo: string; status: StatusProduto; versao: string };
  /** O que falta para sair de rascunho (calculado no servidor com a regra única). */
  pendencias: string[];
}

const EFEITO: Record<StatusProduto, string> = {
  PUBLICADO: "aparece na vitrine para quem tem matrícula",
  NAO_LISTADO: "fica acessível para quem tem matrícula, mas fora da vitrine",
  RASCUNHO: "some para os alunos (só a equipe vê)",
};

/** Situação do produto: Rascunho, Publicado ou Não listado. Sair de rascunho exige os pré-requisitos. */
export function SituacaoProduto({ produto, pendencias }: SituacaoProdutoProps) {
  const router = useRouter();
  const [escolhida, setEscolhida] = useState<StatusProduto>(produto.status);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const bloqueada = escolhida !== "RASCUNHO" && pendencias.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <CampoMoldura id="situacao-produto" rotulo="Situação">
        <GrupoChips
          id="situacao-produto"
          aria-labelledby="situacao-produto-rotulo"
          opcoes={STATUS_PRODUTO.map((s) => ({ valor: s, rotulo: ROTULO_STATUS_PRODUTO[s] }))}
          valor={escolhida}
          onMudar={(v) => {
            setEscolhida(v);
            setErro(null);
          }}
        />
      </CampoMoldura>
      <p className="m-0 text-[13px] text-muted">
        {ROTULO_STATUS_PRODUTO[escolhida]}: {EFEITO[escolhida]}.
      </p>
      {pendencias.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-2 p-3 text-[13px]" role="status">
          <b>Para publicar, falta:</b>
          <ul className="m-0 mt-1 list-disc pl-5">
            {pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {erro && (
        <p role="alert" className="m-0 text-[13px] font-semibold text-warn">
          {erro}
        </p>
      )}
      <Button size="42" disabled={escolhida === produto.status || bloqueada} onClick={() => setConfirmando(true)} className="self-start">
        Aplicar situação
      </Button>
      <ModalConfirmacaoBlock
        aberto={confirmando}
        titulo={`${ROTULO_STATUS_PRODUTO[produto.status]} → ${ROTULO_STATUS_PRODUTO[escolhida]}`}
        mensagem={`"${produto.titulo}" ${EFEITO[escolhida]}. A mudança fica registrada na trilha.`}
        textoConfirmar="Confirmar"
        carregando={pendente}
        onCancelar={() => setConfirmando(false)}
        onConfirmar={() =>
          iniciar(async () => {
            const r = await acaoAlterarSituacaoProduto({ produtoId: produto.id, versao: produto.versao, status: escolhida });
            setConfirmando(false);
            if (!r.ok) return setErro(r.erro);
            router.refresh();
          })
        }
      />
    </div>
  );
}
