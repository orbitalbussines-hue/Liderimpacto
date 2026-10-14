import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { BookOpen, Bookmark, NotebookPen, SearchX, Users } from "lucide-react";
import { CartaoCurso } from "@/components/curso/cartao-curso";
import { Abas } from "@/components/ui/abas";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Esqueleto } from "@/components/ui/esqueleto";
import { CartaoFileira } from "@/components/vitrine/cartao-fileira";
import { urlDeImagemOuNula } from "@/lib/armazenamento/cliente";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { cursosDoAluno } from "@/lib/matriculas/consultas";
import { comImagens, minhaLista, progressoDosCursos } from "@/lib/progresso/consultas";
import { FiltrosContinuar } from "./_components/filtros-continuar";

export const metadata: Metadata = { title: "Continuar aprendendo" };

/**
 * Continuar aprendendo (README tela 3): cursos do membro LOGADO com progresso real, favoritos
 * ("Minha lista") e, por enquanto, "Em breve" em Anotações e Turmas (sem consulta de listagem
 * ainda). Aba, busca e situação vivem na URL (GET), então a tela funciona sem JavaScript.
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
      corpo: <EstadoVazio comMoldura icone={<BookOpen />} titulo="Você ainda não tem cursos" descricao={`Quando a equipe da ${q.criador.nome} liberar um curso para você, ele aparece aqui.`} />,
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

const EM_BREVE: Record<"anotacoes" | "turmas", Conteudo> = {
  anotacoes: { total: 0, exibidos: 0, corpo: <EstadoVazio comMoldura icone={<NotebookPen />} titulo="Em breve" descricao="As anotações que você faz nas aulas vão aparecer reunidas aqui." /> },
  turmas: { total: 0, exibidos: 0, corpo: <EstadoVazio comMoldura icone={<Users />} titulo="Em breve" descricao="As turmas de que você participa vão aparecer aqui." /> },
};

async function Continuar({ searchParams }: { searchParams: Busca }) {
  const [sp, q] = await Promise.all([searchParams, membroDaPagina(TODOS_OS_MEMBROS)]);
  const aba: Aba = ABAS.find((a) => a.valor === sp.aba)?.valor ?? "conteudos";
  const busca = texto(sp.q);
  const situacao = (SITUACOES as readonly string[]).includes(texto(sp.situacao)) ? texto(sp.situacao) : "";
  const c = aba === "conteudos" ? await abaConteudos(q, busca, situacao) : aba === "favoritos" ? await abaFavoritos(q, busca) : EM_BREVE[aba];
  const hrefAba = (valor: string) => {
    const p = new URLSearchParams();
    if (valor !== "conteudos") p.set("aba", valor);
    if (busca) p.set("q", busca);
    const s = p.toString();
    return s ? `/continuar?${s}` : "/continuar";
  };
  const comFiltros = aba === "conteudos" || aba === "favoritos";
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
