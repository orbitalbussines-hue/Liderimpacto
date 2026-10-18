import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { listarTags } from "@/lib/membros/consultas";
import { ChipTag } from "../_components/chip-tag";
import { ABAS_MEMBROS, dataCurta } from "../_components/comum";
import { AcoesTag, NovaTag } from "./acoes-tag";

export const metadata: Metadata = { title: "Tags" };

const COLUNAS: Coluna[] = [
  { titulo: "Tag" },
  { titulo: "Membros", largura: 110 },
  { titulo: "Criada em", largura: 110 },
  { titulo: "Ações", largura: 56 },
];

type Busca = Promise<Record<string, string | string[] | undefined>>;

async function Tags({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const q = (await searchParams).q;
  const busca = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 40) || undefined;
  const todas = await listarTags(criador.id);
  const tags = busca ? todas.filter((t) => t.nome.toLowerCase().includes(busca.toLowerCase())) : todas;
  const linhas: Linha[] = tags.map((t) => [
    { tipo: "no", conteudo: <ChipTag tag={t} /> },
    {
      tipo: "no",
      conteudo: (
        <Link href={`/admin/membros?tag=${t.id}`} className="font-bold text-accent underline-offset-2 hover:underline" aria-label={`${t.membros} membros com a tag ${t.nome}`}>
          {t.membros}
        </Link>
      ),
    },
    { tipo: "data", texto: dataCurta(t.criadoEm) },
    { tipo: "no", conteudo: <AcoesTag tag={{ id: t.id, nome: t.nome, cor: t.cor, membros: t.membros, versao: t.versao.toISOString() }} /> },
  ]);
  const marcados = todas.reduce((s, t) => s + t.membros, 0);
  return (
    <PaginaTabela
      titulo="Membros"
      estatistica={`${todas.length} ${todas.length === 1 ? "tag" : "tags"} · ${marcados} ${marcados === 1 ? "marcação" : "marcações"}`}
      abas={ABAS_MEMBROS}
      abaAtiva="Tags"
      busca="Pesquise pelo nome da tag..."
      valorBusca={busca}
      formBusca={{ nome: "q" }}
      filtrosAtivos={busca ? [{ rotulo: `Busca · ${busca}`, hrefRemover: "/admin/membros/tags" }] : []}
      acoes={<NovaTag />}
      colunas={COLUNAS}
      linhas={linhas}
      chaves={tags.map((t) => t.id)}
      vazio={
        busca
          ? { titulo: "Nenhuma tag encontrada", descricao: "Ajuste a busca." }
          : { titulo: "Nenhuma tag ainda", descricao: "Tags organizam a lista de membros (ex.: VIP, Mentoria, Turma de março). Crie uma e marque os membros pelo menu de cada pessoa." }
      }
    />
  );
}

/** Tags de membros do criador do HOST (DONO e ADMIN), RN-200. */
export default function PaginaTags({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Tags searchParams={searchParams} />
    </Suspense>
  );
}
