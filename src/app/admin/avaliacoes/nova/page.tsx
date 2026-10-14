import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao } from "@/components/ui/cartao";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { listarProdutos } from "@/lib/catalogo/consultas";
import { FormNovaAvaliacao } from "./form-nova-avaliacao";

export const metadata: Metadata = { title: "Nova avaliação" };

type Busca = Promise<Record<string, string | string[] | undefined>>;

/** A página confere o papel por conta própria (o layout não é fronteira). */
async function Formulario({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const [{ curso }, produtos] = await Promise.all([searchParams, listarProdutos(criador.id, { pagina: 1, porPagina: 200 })]);
  const cursos = produtos.linhas.map((p) => ({ id: p.id, titulo: p.titulo })).sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
  // Pré-seleção só se o id for de um curso desta área.
  const inicial = cursos.find((c) => c.id === curso)?.id;
  return <FormNovaAvaliacao cursos={cursos} cursoInicial={inicial} />;
}

export default function PaginaNovaAvaliacao({ searchParams }: { searchParams: Busca }) {
  return (
    <div className="flex max-w-[680px] flex-col gap-5">
      <Link href="/admin/avaliacoes" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Avaliações
      </Link>
      <CabecalhoPagina
        variante="admin"
        titulo="Nova avaliação"
        descricao="A avaliação nasce em rascunho. Em seguida você define módulo, nota mínima, tentativas e tempo, cadastra as questões e publica."
      />
      <Cartao padding={24}>
        <Suspense fallback={null}>
          <Formulario searchParams={searchParams} />
        </Suspense>
      </Cartao>
    </div>
  );
}
