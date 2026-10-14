import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Esqueleto } from "@/components/ui/esqueleto";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { EstadoVazio } from "@/components/ui/estado-vazio";

/** Telas do aluno ainda sem conteúdo real: slug -> título da tela. Fora daqui: 404. */
const SECOES: Record<string, string> = {
  comunidade: "Comunidade",
};

export function generateStaticParams() {
  return Object.keys(SECOES).map((secao) => ({ secao }));
}

type Params = Promise<{ secao: string }>;

async function Secao({ params }: { params: Params }) {
  const { secao } = await params;
  const titulo = SECOES[secao];
  if (!titulo) notFound();
  return (
    <>
      <CabecalhoPagina titulo={titulo} />
      <EstadoVazio comMoldura titulo="Esta área está em construção" descricao="Em breve por aqui." />
    </>
  );
}

// params dentro de <Suspense>: exigencia do cacheComponents para a navegacao ser instantanea.
export default function SecaoEmConstrucao({ params }: { params: Params }) {
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <Suspense fallback={<Esqueleto className="h-12 w-72" />}>
        <Secao params={params} />
      </Suspense>
    </div>
  );
}
