"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Resultado } from "@/lib/acao";

/** Roda a action, mostra o erro ou conclui e recarrega a lista (Grupos, Tags, Vouchers). */
export function useAcao() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = <T,>(acao: () => Promise<Resultado<T>>, aoConcluir: (dados: T) => void) =>
    iniciar(async () => {
      setErro(null);
      const r = await acao();
      if (!r.ok) return setErro(r.erro);
      aoConcluir(r.dados);
      router.refresh();
    });
  return { erro, setErro, pendente, rodar };
}
