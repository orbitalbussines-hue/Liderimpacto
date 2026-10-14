import type { Metadata } from "next";
import { Suspense } from "react";
import { ConteudoAula, type ParametrosAula } from "./_components/conteudo-aula";
import { EsqueletoAula } from "./_components/esqueleto-aula";

export const metadata: Metadata = { title: "Aula" };

/** Tela 5 (player da aula). Sessão, criador do host e dados dentro do <Suspense> (cacheComponents). */
export default function PaginaAula({ params, searchParams }: ParametrosAula) {
  return (
    <Suspense fallback={<EsqueletoAula />}>
      <ConteudoAula params={params} searchParams={searchParams} />
    </Suspense>
  );
}
