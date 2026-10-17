import type { Metadata } from "next";
import { Suspense } from "react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { listarGrupos } from "@/lib/membros/consultas";
import { ABAS_MEMBROS, dataCurta } from "../_components/comum";
import { AcoesGrupo, NovoGrupo } from "./acoes-grupo";

export const metadata: Metadata = { title: "Grupos de acesso" };

const COLUNAS: Coluna[] = [
  { titulo: "Grupo" },
  { titulo: "Tipo", largura: 130 },
  { titulo: "Membros", largura: 110 },
  { titulo: "Criado em", largura: 110 },
  { titulo: "Ações", largura: 56 },
];

type Busca = Promise<Record<string, string | string[] | undefined>>;

async function Grupos({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const q = (await searchParams).q;
  const busca = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 80) || undefined;
  const todos = await listarGrupos(criador.id);
  const grupos = busca ? todos.filter((g) => g.nome.toLowerCase().includes(busca.toLowerCase())) : todos;
  const linhas: Linha[] = grupos.map((g) => [
    { tipo: "texto", texto: g.nome },
    { tipo: "selo", texto: g.tipo === "TURMA" ? "Turma" : "Acesso", tom: g.tipo === "TURMA" ? "accent" : "neutro" },
    { tipo: "numeroDestaque", texto: String(g.membros) },
    { tipo: "data", texto: dataCurta(g.criadoEm) },
    { tipo: "no", conteudo: <AcoesGrupo grupo={{ id: g.id, nome: g.nome, membros: g.membros, versao: g.versao.toISOString() }} /> },
  ]);
  return (
    <PaginaTabela
      titulo="Membros"
      estatistica={`${todos.length} ${todos.length === 1 ? "grupo" : "grupos"} · ${todos.filter((g) => g.tipo === "TURMA").length} turmas`}
      abas={ABAS_MEMBROS}
      abaAtiva="Grupos de acesso"
      busca="Pesquise pelo nome do grupo..."
      valorBusca={busca}
      formBusca={{ nome: "q" }}
      filtrosAtivos={busca ? [{ rotulo: `Busca · ${busca}`, hrefRemover: "/admin/membros/grupos" }] : []}
      acoes={<NovoGrupo />}
      colunas={COLUNAS}
      linhas={linhas}
      chaves={grupos.map((g) => g.id)}
      vazio={
        busca
          ? { titulo: "Nenhum grupo encontrado", descricao: "Ajuste a busca." }
          : { titulo: "Nenhum grupo ainda", descricao: "Turmas e grupos de acesso organizam os membros e podem liberar conteúdos, eventos e desafios só para quem faz parte." }
      }
    />
  );
}

/** Grupos de acesso e turmas do criador do HOST (DONO e ADMIN). */
export default function PaginaGrupos({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Grupos searchParams={searchParams} />
    </Suspense>
  );
}
