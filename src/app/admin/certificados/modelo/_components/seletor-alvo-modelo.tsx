"use client";

import { useRouter } from "next/navigation";
import { Selecao, type OpcaoSelecao } from "@/components/ui/selecao";

/** Qual modelo editar: o padrão da área ("") ou o de um curso. Trocar navega (`?produto=<id>`). */
export function SeletorAlvoModelo({ atual, opcoes }: { atual: string; opcoes: readonly OpcaoSelecao[] }) {
  const router = useRouter();
  return (
    <Selecao
      rotulo="Modelo de"
      estiloRotulo="discreto"
      tamanho="42"
      value={atual}
      onChange={(e) => router.push(e.target.value ? `/admin/certificados/modelo?produto=${e.target.value}` : "/admin/certificados/modelo")}
      opcoes={opcoes}
      classNameMoldura="min-w-[280px]"
    />
  );
}
