import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { urlDeImagemOuNula } from "@/lib/armazenamento/cliente";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { trilhasDoAdmin } from "@/lib/trilhas/consultas";
import { dataCurta } from "../membros/_components/comum";
import { AcoesTrilha } from "./_components/acoes-trilha";

export const metadata: Metadata = { title: "Trilhas" };

const COLUNAS: Coluna[] = [
  { titulo: "Capa", largura: 56 },
  { titulo: "Trilha" },
  { titulo: "Etapas", largura: 90 },
  { titulo: "Situação", largura: 120 },
  { titulo: "Publicada em", largura: 120 },
  { titulo: "Ações", largura: 56 },
];

type Busca = Promise<Record<string, string | string[] | undefined>>;

async function Trilhas({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  const busca = (typeof sp.q === "string" ? sp.q.trim() : "").slice(0, 100);
  const todas = await trilhasDoAdmin(criador.id);
  // ponytail: filtro em memória (poucas trilhas por criador); levar à consulta se passar de centenas.
  const termo = busca.toLocaleLowerCase("pt-BR");
  const trilhas = termo ? todas.filter((t) => `${t.titulo} ${t.tag}`.toLocaleLowerCase("pt-BR").includes(termo)) : todas;
  const capas = await Promise.all(trilhas.map((t) => urlDeImagemOuNula(criador.id, t.capaChave)));
  const publicadas = todas.filter((t) => t.status === "PUBLICADA").length;

  const linhas: Linha[] = trilhas.map((t, i) => [
    { tipo: "capa", alt: `Capa de ${t.titulo}`, src: capas[i] },
    { tipo: "texto", texto: t.titulo, sub: t.tag || undefined },
    { tipo: "numeroDestaque", texto: String(t.itens) },
    t.status === "PUBLICADA" ? { tipo: "selo", texto: "Publicada", tom: "ok" } : { tipo: "selo", texto: "Rascunho", tom: "neutro" },
    { tipo: "data", texto: t.publicadaEm ? dataCurta(t.publicadaEm) : "—" },
    { tipo: "no", conteudo: <AcoesTrilha trilha={{ id: t.id, titulo: t.titulo, status: t.status, etapas: t.itens, versao: t.versao }} /> },
  ]);

  return (
    <PaginaTabela
      titulo="Trilhas"
      estatistica={
        <>
          {todas.length} total · <b className="text-ok">{publicadas === 1 ? "1 publicada" : `${publicadas} publicadas`}</b> · {todas.length - publicadas} em rascunho
        </>
      }
      abas={[{ rotulo: "Trilhas", href: "/admin/trilhas" }]}
      busca="Pesquise pelo título ou tag..."
      valorBusca={busca || undefined}
      formBusca={{ nome: "q" }}
      filtrosAtivos={busca ? [{ rotulo: `Busca · ${busca}`, hrefRemover: "/admin/trilhas" }] : []}
      acaoPrincipal={{ rotulo: "Nova trilha", icone: Plus, href: "/admin/trilhas/nova" }}
      colunas={COLUNAS}
      linhas={linhas}
      chaves={trilhas.map((t) => t.id)}
      vazio={
        busca
          ? { titulo: "Nenhuma trilha encontrada", descricao: "Ajuste a busca." }
          : { titulo: "Nenhuma trilha ainda", descricao: "Monte uma sequência de cursos e avaliações em “Nova trilha”. O aluno vê o caminho e o próximo passo." }
      }
    />
  );
}

/** Trilhas do criador do HOST (DONO e ADMIN). */
export default function PaginaTrilhas({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Trilhas searchParams={searchParams} />
    </Suspense>
  );
}
