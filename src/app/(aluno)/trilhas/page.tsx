import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Route } from "lucide-react";
import { duracaoCurta } from "@/components/aluno/formatos";
import { CartaoTrilha } from "@/components/engajamento/cartao-trilha";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Esqueleto } from "@/components/ui/esqueleto";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { trilhasDoAluno } from "@/lib/trilhas/consultas";

export const metadata: Metadata = { title: "Trilhas de aprendizado" };

async function ListaTrilhas() {
  const q = await membroDaPagina(TODOS_OS_MEMBROS);
  const trilhas = await trilhasDoAluno(q);
  if (trilhas.length === 0)
    return (
      <EstadoVazio
        comMoldura
        icone={<Route />}
        titulo="Nenhuma trilha por aqui ainda"
        descricao="As trilhas aparecem quando a equipe monta uma sequência com os seus cursos. Enquanto isso, siga pelos cursos."
        acao={
          <Link href="/continuar" className={buttonVariants({ variant: "contorno", size: "40" })}>
            Ver meus cursos
          </Link>
        }
        className="py-16"
      />
    );
  return (
    <div className="flex flex-col gap-4">
      {trilhas.map((t) => (
        <CartaoTrilha
          key={t.id}
          tag={t.tag}
          titulo={t.titulo}
          descricao={t.descricao}
          totalEtapas={t.etapas}
          etapasConcluidas={t.concluidas}
          estados={t.itens.map((i) => i.estado)}
          duracao={duracaoCurta(t.duracaoSeg)}
          cta={t.cta}
          href={`/trilhas/${t.id}`}
        />
      ))}
    </div>
  );
}

const esqueleto = (
  <div aria-busy className="flex flex-col gap-4">
    <span className="sr-only">Carregando trilhas</span>
    {[0, 1, 2].map((i) => (
      <Esqueleto key={i} className="h-[178px] rounded-[18px]" />
    ))}
  </div>
);

/** Trilhas de aprendizado (README tela 7): sequências publicadas que o membro vê, com o progresso real. */
export default function PaginaTrilhas() {
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <CabecalhoPagina titulo="Trilhas de aprendizado" descricao="Sequências guiadas que combinam aulas, exercícios e mentorias." />
      <Suspense fallback={esqueleto}>
        <ListaTrilhas />
      </Suspense>
    </div>
  );
}
