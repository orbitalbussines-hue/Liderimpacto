"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acaoParticiparDoDesafio } from "@/lib/actions/gamificacao";

/** "Participar" (opt-in do próprio aluno). Erro aparece embaixo; sucesso recarrega o progresso. */
export function BotaoParticipar({ desafioId, titulo }: { desafioId: string; titulo: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        size="40"
        carregando={pendente}
        aria-label={`Participar do desafio ${titulo}`}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await acaoParticiparDoDesafio({ desafioId }).catch(() => null);
            if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
            if (!r.ok) return setErro(r.erro);
            router.refresh();
          })
        }
      >
        Participar
      </Button>
      {erro && (
        <p role="alert" className="m-0 text-xs font-semibold text-warn">
          {erro}
        </p>
      )}
    </div>
  );
}
