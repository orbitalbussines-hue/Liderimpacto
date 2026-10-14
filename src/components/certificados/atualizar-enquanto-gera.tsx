"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Enquanto houver PDF sendo gerado pelo worker, recarrega os dados da página a cada `ms`. */
export function AtualizarEnquantoGera({ ativo, ms = 5000 }: { ativo: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [ativo, ms, router]);
  return null;
}
