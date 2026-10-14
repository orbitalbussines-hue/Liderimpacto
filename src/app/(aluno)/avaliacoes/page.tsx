import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClipboardList } from "lucide-react";
import { LinhaAvaliacao, type EstadoAvaliacao } from "@/components/engajamento/linha-avaliacao";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Esqueleto } from "@/components/ui/esqueleto";
import { avaliacoesDoAluno } from "@/lib/avaliacoes/consultas";
import { TEXTO_MOTIVO_AVALIACAO, type SituacaoAvaliacaoAluno } from "@/lib/avaliacoes/regras";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";

export const metadata: Metadata = { title: "Avaliações" };

const ESTADO: Record<SituacaoAvaliacaoAluno, EstadoAvaliacao> = { CONCLUIDA: "concluida", EM_ANDAMENTO: "andamento", DISPONIVEL: "disponivel", BLOQUEADA: "bloqueada" };

async function Lista() {
  const q = await membroDaPagina(TODOS_OS_MEMBROS);
  const cards = await avaliacoesDoAluno(q);
  if (cards.length === 0) {
    return (
      <EstadoVazio
        comMoldura
        icone={<ClipboardList />}
        titulo="Nenhuma avaliação por aqui ainda"
        descricao="Quando um curso seu tiver quiz, prova ou simulado, ele aparece nesta lista."
        acao={
          <Link href="/continuar" className={buttonVariants({ variant: "contorno" })}>
            Ver meus cursos
          </Link>
        }
      />
    );
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {cards.map((c) => (
        <li key={c.id}>
          <LinhaAvaliacao
            titulo={c.titulo}
            curso={c.modulo ? `${c.curso.titulo} · ${c.modulo.titulo}` : c.curso.titulo}
            meta={c.meta}
            estado={ESTADO[c.situacao]}
            // Bloqueada sem tentativa: selo "Bloqueada" e o motivo no botão (como no protótipo).
            status={c.situacao === "BLOQUEADA" && c.cta === null ? "Bloqueada" : c.rotulo}
            cta={c.cta}
            rotuloBloqueada={c.motivo ? TEXTO_MOTIVO_AVALIACAO[c.motivo] : undefined}
            href={c.href}
          />
        </li>
      ))}
    </ul>
  );
}

function Carregando() {
  return (
    <div aria-busy className="flex flex-col gap-3">
      <span className="sr-only">Carregando avaliações…</span>
      {[0, 1, 2].map((i) => (
        <Esqueleto key={i} className="h-[82px] rounded-2xl" />
      ))}
    </div>
  );
}

/** Tela 6: quizzes e provas dos cursos do aluno, com status e o próximo passo de cada um. */
export default function PaginaAvaliacoes() {
  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-6">
      <CabecalhoPagina titulo="Avaliações" descricao="Quizzes e provas dos seus cursos. A avaliação final libera o certificado." />
      <Suspense fallback={<Carregando />}>
        <Lista />
      </Suspense>
    </div>
  );
}
