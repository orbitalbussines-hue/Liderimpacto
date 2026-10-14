"use client";

import { useRouter } from "next/navigation";
import { Selecao } from "@/components/ui/selecao";

/** Canais no celular: um `<select>` nativo no topo que navega para `?canal=`. */
export function SeletorCanal({ canais, ativoHref }: { canais: readonly { nome: string; href: string }[]; ativoHref: string }) {
  const router = useRouter();
  return (
    <Selecao
      rotulo="Canal"
      rotuloOculto
      tamanho="42"
      fundo="surface"
      opcoes={canais.map((c) => ({ valor: c.href, rotulo: `# ${c.nome}` }))}
      value={ativoHref}
      onChange={(e) => router.push(e.target.value)}
    />
  );
}
