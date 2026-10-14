/**
 * TEMPLATE-OURO: componente de feature (colocation).
 *
 *   src/app/(app)/lancamentos/
 *     page.tsx                   <- Server Component: busca dados, resolve RBAC
 *     _components/
 *       lancamentos-lista.tsx    <- ESTE arquivo (client, interativo)
 *       lancamentos-lista.test.tsx
 *
 * 1 componente por arquivo, export nomeado, props tipadas (nunca `any`).
 * "use client" SO quando precisa de estado/evento. Acao critica passa pelo
 * ModalConfirmacaoBlock. Erro aparece na tela — nunca `alert()`.
 */
"use client";

import { useState } from "react";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { excluir } from "@/lib/actions/contratos-lancamentos";
import type { ContratoLancamento } from "@/lib/db/schema/contratos-lancamentos";

interface LancamentosListaProps {
  /** Dados ja carregados pelo Server Component pai. */
  itens: ContratoLancamento[];
  /** RBAC resolvido no servidor. Esconder o botao NAO e a defesa: a action confere. */
  podeExcluir: boolean;
}

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function LancamentosLista({ itens, podeExcluir }: LancamentosListaProps) {
  const [alvo, setAlvo] = useState<ContratoLancamento | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmarExclusao() {
    if (!alvo) return;
    setProcessando(true);
    setErro(null);
    try {
      const r = await excluir(alvo.id, alvo.updated_at);
      if (!r.ok) setErro(r.erro);
      setAlvo(null); // a lista atualiza pelo revalidatePath da action
    } finally {
      setProcessando(false);
    }
  }

  if (itens.length === 0) {
    return <p className="text-muted-foreground">Nenhum lancamento cadastrado.</p>;
  }

  return (
    <div className="space-y-3">
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <ul className="space-y-2">
        {itens.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <span>{item.descricao}</span>
            <span className="tabular-nums">{moeda.format(Number(item.valor))}</span>
            {podeExcluir && (
              <Button variant="destructive" onClick={() => setAlvo(item)}>
                Excluir
              </Button>
            )}
          </li>
        ))}
      </ul>

      <ModalConfirmacaoBlock
        aberto={alvo !== null}
        titulo="Excluir lancamento"
        mensagem={`Confirma excluir "${alvo?.descricao}"? O registro sai da lista e a exclusao fica na auditoria.`}
        textoConfirmar="Excluir"
        onConfirmar={confirmarExclusao}
        onCancelar={() => setAlvo(null)}
        carregando={processando}
      />
    </div>
  );
}
