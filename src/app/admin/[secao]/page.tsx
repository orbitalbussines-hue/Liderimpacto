import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PaginaCards } from "@/components/admin/pagina-cards";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import { TODOS_ITENS, secaoAcessivel } from "@/components/admin/navegacao";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Hammer } from "lucide-react";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";

type Params = Promise<{ secao: string }>;

export function generateStaticParams() {
  return TODOS_ITENS.filter((i) => i.slug !== "home").map((i) => ({ secao: i.slug }));
}

async function Secao({ params }: { params: Params }) {
  const { secao } = await params;
  // Cada pagina confere por conta propria (o layout nao e fronteira): papel lido do banco agora.
  const { membro } = await membroDaPagina(EQUIPE);
  const item = secaoAcessivel(secao, membro.papel === "DONO" ? "DONO" : "ADMIN");
  if (!item) notFound();

  const { molde } = item;
  if (molde.tipo === "tabela") {
    return (
      <PaginaTabela
        titulo={molde.titulo}
        estatistica={molde.estatistica}
        abas={molde.abas}
        busca={molde.busca}
        filtros={molde.filtros}
        colunas={molde.colunas}
        linhas={[]}
        acaoPrincipal={molde.acaoPrincipal}
        acaoSecundaria={molde.acaoSecundaria}
      />
    );
  }
  if (molde.tipo === "cards") {
    return <PaginaCards titulo={molde.titulo} subtitulo={molde.subtitulo} acao={molde.acao} cards={molde.cards} />;
  }
  return <EstadoVazio comMoldura icone={<Hammer />} titulo="Em construção" descricao={`${item.rotulo} ganha tela própria em breve.`} />;
}

/** Rota genérica do admin: toda tela sem desenho próprio sai do molde de `navegacao.ts`. */
export default function PaginaSecao({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <Secao params={params} />
    </Suspense>
  );
}
