import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { BookOpen, Bookmark, NotebookPen, SearchX, Users } from "lucide-react";
import { mesAno } from "@/components/aluno/formatos";
import { CartaoCurso } from "@/components/curso/cartao-curso";
import { Abas } from "@/components/ui/abas";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Esqueleto } from "@/components/ui/esqueleto";
import { Selo } from "@/components/ui/selo";
import { CartaoFileira } from "@/components/vitrine/cartao-fileira";
import { urlDeImagemOuNula } from "@/lib/armazenamento/cliente";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { cursosDoAluno } from "@/lib/matriculas/consultas";
import { comImagens, minhaLista, progressoDosCursos } from "@/lib/progresso/consultas";
import { anotacoesDoAluno, turmasDoAluno } from "@/lib/progresso/continuar";
import { formatarTempo } from "@/lib/validators/catalogo";
import { FiltrosContinuar } from "./_components/filtros-continuar";

export const metadata: Metadata = { title: "Continuar aprendendo" };

/**
 * Continuar aprendendo (README tela 3): cursos do membro LOGADO com progresso real, favoritos
 * ("Minha lista"), anotações por curso (cada uma abre a aula no minuto) e turmas (RN-205).
 * Aba, busca e situação vivem na URL (GET), então a tela funciona sem JavaScript.
 */

const ABAS = [
  { valor: "conteudos", rotulo: "Conteúdos" },
  { valor: "favoritos", rotulo: "Favoritos" },
  { valor: "anotacoes", rotulo: "Anotações" },
  { valor: "turmas", rotulo: "Turmas" },
] as const;
type Aba = (typeof ABAS)[number]["valor"];
const SITUACOES = ["andamento", "nao-iniciados", "concluidos"] as const;

type Busca = Promise<Record<string, string | string[] | undefined>>;
type Quem = Awaited<ReturnType<typeof membroDaPagina>>;
const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim().slice(0, 80) : "");
/** Comparação sem acento nem caixa ("líder" acha "LIDER"). */
const normalizar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

interface Conteudo {
  total: number;
  exibidos: number;
  corpo: ReactNode;
}

const GRADE = "grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-[18px]";

async function abaConteudos(q: Quem, busca: string, situacao: string): Promise<Conteudo> {
  // SUPER_ADMIN sem vínculo (suporte) não tem matrícula própria.
  const cursos = q.membro.id ? await cursosDoAluno(q.criador.id, q.membro.id, new Date()) : [];
  if (cursos.length === 0) {
    return {
      total: 0,
      exibidos: 0,
      corpo: (
        <EstadoVazio
          comMoldura
          icone={<BookOpen />}
          titulo="Você ainda não tem cursos"
          descricao={`Quando a equipe da ${q.criador.nome} liberar um curso para você, ele aparece aqui.`}
          acao={
            <Link href="/resgatar" className={buttonVariants({ variant: "contorno", size: "40" })}>
              Tenho um código de voucher
            </Link>
          }
        />
      ),
    };
  }
  const progresso = await progressoDosCursos(q, cursos.map((c) => c.produtoId));
  const termo = normalizar(busca);
  const naSituacao = ({ concluidas, total }: { concluidas: number; total: number }) =>
    situacao === "concluidos"
      ? total > 0 && concluidas === total
      : situacao === "nao-iniciados"
        ? concluidas === 0
        : situacao === "andamento"
          ? concluidas > 0 && concluidas < total
          : true;
  const filtrados = cursos
    .map((c) => ({ ...c, p: progresso.get(c.produtoId) ?? { concluidas: 0, total: c.totalAulas, percentual: 0 } }))
    .filter((c) => (!termo || normalizar(c.titulo).includes(termo)) && naSituacao(c.p));
  if (filtrados.length === 0) {
    return { total: cursos.length, exibidos: 0, corpo: <EstadoVazio icone={<SearchX />} titulo="Nenhum curso encontrado" descricao="Tente outro termo ou outra situação." /> };
  }
  const capas = await Promise.all(filtrados.map((c) => urlDeImagemOuNula(q.criador.id, c.capaChave)));
  return {
    total: cursos.length,
    exibidos: filtrados.length,
    corpo: (
      <div className={GRADE}>
        {filtrados.map((c, i) => (
          <CartaoCurso
            key={c.produtoId}
            titulo={c.titulo}
            capaUrl={capas[i] ?? undefined}
            progresso={c.p.percentual}
            aulasConcluidas={c.p.concluidas}
            totalAulas={c.p.total}
            href={`/cursos/${c.slug}`}
          />
        ))}
      </div>
    ),
  };
}

async function abaFavoritos(q: Quem, busca: string): Promise<Conteudo> {
  const lista = await minhaLista(q);
  const termo = normalizar(busca);
  const filtrados = await comImagens(q.criador.id, lista.filter((i) => !termo || normalizar(`${i.titulo} ${i.subtitulo}`).includes(termo)));
  const corpo =
    lista.length === 0 ? (
      <EstadoVazio comMoldura icone={<Bookmark />} titulo="Sua lista está vazia" descricao="Use o botão “Minha lista” na página de um curso para guardá-lo aqui." />
    ) : filtrados.length === 0 ? (
      <EstadoVazio icone={<SearchX />} titulo="Nada encontrado na sua lista" descricao="Tente outro termo." />
    ) : (
      <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-5 p-0">
        {filtrados.map((i) => (
          <li key={i.id}>
            <CartaoFileira item={{ id: i.id, titulo: i.titulo, subtitulo: i.subtitulo, imagemUrl: i.imagemUrl, href: i.href }} />
          </li>
        ))}
      </ul>
    );
  return { total: lista.length, exibidos: filtrados.length, corpo };
}

async function abaAnotacoes(q: Quem, busca: string): Promise<Conteudo> {
  const lista = await anotacoesDoAluno(q);
  const termo = normalizar(busca);
  const filtradas = lista.filter((a) => !termo || normalizar(`${a.texto} ${a.aula} ${a.produto}`).includes(termo));
  if (lista.length === 0) {
    return {
      total: 0,
      exibidos: 0,
      corpo: <EstadoVazio comMoldura icone={<NotebookPen />} titulo="Nenhuma anotação ainda" descricao="Na aba Anotações de cada aula, anote o que quer lembrar. Tudo aparece reunido aqui, com o minuto do vídeo." />,
    };
  }
  if (filtradas.length === 0) return { total: lista.length, exibidos: 0, corpo: <EstadoVazio icone={<SearchX />} titulo="Nenhuma anotação encontrada" descricao="Tente outro termo." /> };
  // A consulta já vem ordenada por curso, módulo, aula e minuto: agrupar mantém a ordem.
  const porCurso = Map.groupBy(filtradas, (a) => a.produtoId);
  return {
    total: lista.length,
    exibidos: filtradas.length,
    corpo: (
      <div className="flex max-w-[860px] flex-col gap-7">
        {[...porCurso.values()].map((notas) => (
          <section key={notas[0].produtoId} aria-labelledby={`curso-${notas[0].produtoId}`} className="flex flex-col gap-2.5">
            <h2 id={`curso-${notas[0].produtoId}`} className="m-0 text-base font-bold">
              <Link href={`/cursos/${notas[0].produtoSlug}`} className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                {notas[0].produto}
              </Link>
            </h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {notas.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/aula/${a.aulaId}?t=${a.tempoSeg}`}
                    aria-label={`${a.aula}, em ${formatarTempo(a.tempoSeg)}: ${a.texto.slice(0, 120)}`}
                    className="flex items-start gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <span className="mt-px inline-flex h-7 shrink-0 items-center rounded-full bg-accent-soft px-2.5 text-xs font-bold text-accent tabular-nums">{formatarTempo(a.tempoSeg)}</span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
                      <span className="text-xs font-semibold text-muted">{a.aula}</span>
                      <span className="text-sm leading-relaxed break-words whitespace-pre-line">{a.texto}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    ),
  };
}

async function abaTurmas(q: Quem): Promise<Conteudo> {
  const turmas = await turmasDoAluno(q);
  if (turmas.length === 0) {
    return { total: 0, exibidos: 0, corpo: <EstadoVazio comMoldura icone={<Users />} titulo="Você ainda não está em uma turma" descricao={`Quando a equipe da ${q.criador.nome} colocar você em uma turma, ela aparece aqui.`} /> };
  }
  return {
    total: turmas.length,
    exibidos: turmas.length,
    corpo: (
      <ul className="m-0 flex max-w-[860px] list-none flex-col divide-y divide-border rounded-2xl border border-border bg-surface p-0">
        {turmas.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3.5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="m-0 text-[15px] font-bold break-words">{t.nome}</p>
              <p className="m-0 text-[13px] text-muted">
                {t.membros} {t.membros === 1 ? "pessoa" : "pessoas"} · você entrou em {mesAno(t.entrouEm)}
              </p>
            </div>
            <Selo tom="neutro" forma="rotulo">
              {t.tipo === "TURMA" ? "Turma" : "Grupo de acesso"}
            </Selo>
          </li>
        ))}
      </ul>
    ),
  };
}

async function Continuar({ searchParams }: { searchParams: Busca }) {
  const [sp, q] = await Promise.all([searchParams, membroDaPagina(TODOS_OS_MEMBROS)]);
  const aba: Aba = ABAS.find((a) => a.valor === sp.aba)?.valor ?? "conteudos";
  const busca = texto(sp.q);
  const situacao = (SITUACOES as readonly string[]).includes(texto(sp.situacao)) ? texto(sp.situacao) : "";
  const c =
    aba === "conteudos"
      ? await abaConteudos(q, busca, situacao)
      : aba === "favoritos"
        ? await abaFavoritos(q, busca)
        : aba === "anotacoes"
          ? await abaAnotacoes(q, busca)
          : await abaTurmas(q);
  const hrefAba = (valor: string) => {
    const p = new URLSearchParams();
    if (valor !== "conteudos") p.set("aba", valor);
    if (busca) p.set("q", busca);
    const s = p.toString();
    return s ? `/continuar?${s}` : "/continuar";
  };
  const comFiltros = aba !== "turmas";
  return (
    <>
      <CabecalhoPagina titulo="Continuar aprendendo" contador={comFiltros ? c.exibidos : undefined} />
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 border-b border-border">
        <Abas itens={ABAS.map((a) => ({ ...a, href: hrefAba(a.valor) }))} ativo={aba} aria-label="Seções" className="border-b-0" />
        {comFiltros && <FiltrosContinuar aba={aba} busca={busca} situacao={situacao} comSituacao={aba === "conteudos"} />}
      </div>
      {c.corpo}
      {comFiltros && c.exibidos > 0 && (
        <p className="m-0 text-center text-xs text-muted">
          Exibindo {c.exibidos} de {c.total}
        </p>
      )}
    </>
  );
}

function EsqueletoContinuar() {
  return (
    <div aria-busy="true" className="flex flex-col gap-[22px]">
      <span className="sr-only">Carregando seus cursos</span>
      <Esqueleto className="h-10 w-80 max-w-full" />
      <Esqueleto className="h-11 w-full" />
      <div className={GRADE}>
        {[0, 1, 2].map((i) => (
          <Esqueleto key={i} className="h-[330px] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

// searchParams e sessão dentro de <Suspense>: exigência do cacheComponents.
export default function PaginaContinuar({ searchParams }: { searchParams: Busca }) {
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-[22px]">
      <Suspense fallback={<EsqueletoContinuar />}>
        <Continuar searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
