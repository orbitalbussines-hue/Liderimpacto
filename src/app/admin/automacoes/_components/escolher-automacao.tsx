"use client";

import { useRouter } from "next/navigation";
import { Selecao } from "@/components/ui/selecao";

/** Troca a automação do histórico (vai para `?automacao=`; a página recomeça na 1). */
export function EscolherAutomacao({ opcoes, atual }: { opcoes: readonly { valor: string; rotulo: string }[]; atual: string }) {
  const router = useRouter();
  return (
    <Selecao
      rotulo="Automação"
      rotuloOculto
      tamanho="36"
      opcoes={opcoes}
      value={atual}
      onChange={(e) => router.push(`/admin/automacoes/historico?automacao=${e.target.value}`)}
      classNameMoldura="w-full sm:w-auto sm:min-w-[280px]"
    />
  );
}
