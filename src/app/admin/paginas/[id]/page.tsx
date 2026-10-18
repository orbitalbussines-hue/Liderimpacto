import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Esqueleto } from "@/components/ui/esqueleto";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { enderecoDaArea } from "@/lib/criador/area";
import { opcoesDoEditor, paginaParaEditar } from "@/lib/paginas/consultas";
import { idSchema } from "@/lib/validators/membros";
import { EditorPagina } from "./_components/editor-pagina";

export const metadata: Metadata = { title: "Editar página" };

async function Conteudo({ params }: PageProps<"/admin/paginas/[id]">) {
  const [{ id }, { criador }] = await Promise.all([params, membroDaPagina(EQUIPE)]);
  if (!idSchema.safeParse(id).success) notFound();
  const [p, opcoes] = await Promise.all([paginaParaEditar(criador.id, id), opcoesDoEditor(criador.id)]);
  if (!p) notFound();
  return (
    <EditorPagina
      id={p.id}
      titulo={p.titulo}
      slug={p.slug}
      situacao={p.situacao}
      rascunho={p.rascunho}
      publicada={p.publicada}
      publicacoes={p.publicacoes}
      versao={p.versao}
      imagens={p.imagens}
      opcoes={opcoes}
      endereco={enderecoDaArea(criador.slug).url}
    />
  );
}

/** Editor de uma página (DONO e ADMIN): blocos, prévia ao lado, publicar (RN-240, RN-242). */
export default function PaginaEditar(props: PageProps<"/admin/paginas/[id]">) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" className="flex flex-col gap-5">
          <span className="sr-only">Carregando o editor</span>
          <Esqueleto className="h-14 w-80" />
          <Esqueleto className="h-[560px] rounded-2xl" />
        </div>
      }
    >
      <Conteudo {...props} />
    </Suspense>
  );
}
