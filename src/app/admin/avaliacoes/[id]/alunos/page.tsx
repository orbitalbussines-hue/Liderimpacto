import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { buttonVariants } from "@/components/ui/button";
import { alunosDaAvaliacao, avaliacaoParaEditar } from "@/lib/avaliacoes/admin";
import { formatarNota } from "@/lib/avaliacoes/regras";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { dataHoraCurta, ehUuid } from "../../../conteudos/_components/comum";
import { CabecalhoAvaliacao } from "../_components/cabecalho-avaliacao";
import { ConcederTentativa } from "./conceder-tentativa";

export const metadata: Metadata = { title: "Alunos da avaliação" };

const COLUNAS: Coluna[] = [
  { titulo: "Aluno" },
  { titulo: "Melhor nota", largura: 110 },
  { titulo: "Tentativas", largura: 130 },
  { titulo: "Situação", largura: 130 },
  { titulo: "Última tentativa", largura: 150 },
  { titulo: "Ação", largura: 190 },
];

type Params = Promise<{ id: string }>;
type Busca = Promise<Record<string, string | string[] | undefined>>;
const normalizar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

async function Alunos({ params, searchParams }: { params: Params; searchParams: Busca }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { criador } = await membroDaPagina(EQUIPE);
  if (!ehUuid(id)) notFound();
  const [dados, alunos] = await Promise.all([avaliacaoParaEditar(criador.id, id), alunosDaAvaliacao(criador.id, id)]);
  if (!dados || !alunos) notFound();
  const { avaliacao, modulos } = dados;
  const modulo = modulos.find((m) => m.id === avaliacao.moduloId) ?? null;
  const busca = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 100);
  const termo = normalizar(busca);
  const lista = termo ? alunos.filter((a) => normalizar(`${a.nome} ${a.email}`).includes(termo)) : alunos;
  const aprovados = alunos.filter((a) => a.aprovada).length;

  const linhas: Linha[] = lista.map((a) => [
    { tipo: "membro", nome: a.nome, email: a.email, src: a.imagem },
    a.melhorNota === null ? { tipo: "texto", texto: "—" } : { tipo: "numeroDestaque", texto: `${formatarNota(a.melhorNota)}%` },
    {
      tipo: "texto",
      texto: `${a.finalizadas} ${a.finalizadas === 1 ? "feita" : "feitas"}`,
      sub: a.tentativasRestantes === null ? "ilimitadas" : `${a.tentativasRestantes} ${a.tentativasRestantes === 1 ? "restante" : "restantes"}${a.extras ? ` · +${a.extras} concedida${a.extras === 1 ? "" : "s"}` : ""}`,
    },
    a.aprovada
      ? { tipo: "selo", texto: "Aprovado", tom: "ok" }
      : a.emAndamento
        ? { tipo: "selo", texto: "Em andamento", tom: "accent" }
        : { tipo: "selo", texto: "Reprovado", tom: "warn" },
    { tipo: "data", texto: dataHoraCurta(a.ultimaEm) },
    a.podeConceder ? { tipo: "no", conteudo: <ConcederTentativa avaliacaoId={avaliacao.id} aluno={{ membroId: a.membroId, nome: a.nome }} /> } : { tipo: "texto", texto: "—" },
  ]);

  return (
    <>
      <CabecalhoAvaliacao
        ativa="Alunos"
        avaliacao={{ id: avaliacao.id, titulo: avaliacao.campos.titulo, tipo: avaliacao.campos.tipo, status: avaliacao.status, curso: avaliacao.produto.titulo, modulo: modulo ? `Módulo ${modulo.ordem} · ${modulo.titulo}` : null }}
      />
      <PaginaTabela
        titulo="Alunos que tentaram"
        estatistica={`${alunos.length} ${alunos.length === 1 ? "aluno" : "alunos"} · ${aprovados} ${aprovados === 1 ? "aprovado" : "aprovados"}`}
        abas={[]}
        busca="Pesquise por nome ou e-mail..."
        valorBusca={busca}
        formBusca={{ nome: "q" }}
        filtrosAtivos={busca ? [{ rotulo: `Busca · ${busca}`, hrefRemover: `/admin/avaliacoes/${avaliacao.id}/alunos` }] : []}
        colunas={COLUNAS}
        linhas={linhas}
        chaves={lista.map((a) => a.membroId)}
        vazio={
          busca
            ? { titulo: "Nenhum aluno encontrado", descricao: "Tente outro nome ou e-mail." }
            : { titulo: "Nenhum aluno tentou ainda", descricao: "Quem fizer a avaliação aparece aqui com a melhor nota e as tentativas. A prévia da equipe não entra." }
        }
      />
    </>
  );
}

/** Alunos da avaliação (DONO e ADMIN): melhor nota, tentativas e "Conceder tentativa" a quem esgotou sem aprovar. */
export default function PaginaAlunosDaAvaliacao({ params, searchParams }: { params: Params; searchParams: Busca }) {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/avaliacoes" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Avaliações
      </Link>
      <Suspense fallback={null}>
        <Alunos params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
