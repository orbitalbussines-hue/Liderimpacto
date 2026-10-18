import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ehUuid } from "../../conteudos/_components/comum";
import { PaginaFormAutomacao } from "../_components/pagina-form";

export const metadata: Metadata = { title: "Editar automação" };

async function Editar({ params }: { params: PageProps<"/admin/automacoes/[id]">["params"] }) {
  const { id } = await params;
  if (!ehUuid(id)) notFound();
  return <PaginaFormAutomacao automacaoId={id} />;
}

export default function PaginaEditarAutomacao({ params }: PageProps<"/admin/automacoes/[id]">) {
  return (
    <Suspense fallback={null}>
      <Editar params={params} />
    </Suspense>
  );
}
