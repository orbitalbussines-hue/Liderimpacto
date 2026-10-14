import type { Metadata } from "next";
import { Suspense } from "react";
import { BookOpen } from "lucide-react";
import { CartaoCurso } from "@/components/curso/cartao-curso";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Esqueleto } from "@/components/ui/esqueleto";
import { urlDeImagemOuNula } from "@/lib/armazenamento/cliente";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { cursosDoAluno } from "@/lib/matriculas/consultas";

export const metadata: Metadata = { title: "Continuar aprendendo" };

/**
 * Cursos do membro LOGADO (só os dele): matrícula valendo + produto publicado ou não listado.
 * Progresso, página do curso e player entram no passo 5 (progresso 0 por enquanto).
 */
async function Cursos() {
  const { criador, membro } = await membroDaPagina(TODOS_OS_MEMBROS);
  // SUPER_ADMIN sem vínculo (suporte) não tem matrícula própria.
  const cursos = membro.id ? await cursosDoAluno(criador.id, membro.id, new Date()) : [];
  if (cursos.length === 0) {
    return <EstadoVazio comMoldura icone={<BookOpen />} titulo="Você ainda não tem cursos" descricao="Quando a equipe liberar um curso para você, ele aparece aqui." />;
  }
  const capas = await Promise.all(cursos.map((c) => urlDeImagemOuNula(criador.id, c.capaChave)));
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cursos.map((c, i) => (
        <CartaoCurso
          key={c.produtoId}
          titulo={c.titulo}
          capaUrl={capas[i] ?? undefined}
          progresso={0}
          aulasConcluidas={0}
          totalAulas={c.totalAulas}
          href={`/cursos/${c.slug}`}
        />
      ))}
    </div>
  );
}

export default function PaginaContinuar() {
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <CabecalhoPagina titulo="Continuar aprendendo" />
      <Suspense
        fallback={
          <div aria-busy="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <span className="sr-only">Carregando seus cursos</span>
            {[0, 1, 2].map((i) => (
              <Esqueleto key={i} className="h-72 rounded-2xl" />
            ))}
          </div>
        }
      >
        <Cursos />
      </Suspense>
    </div>
  );
}
