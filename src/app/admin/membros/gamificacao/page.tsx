import type { Metadata } from "next";
import { Suspense } from "react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { alunosComPontos } from "@/lib/gamificacao/admin";
import { pontosPtBr } from "@/lib/gamificacao/regras";
import { AvisoDesligada } from "../../desafios/_components/aviso-desligada";
import { ABAS_MEMBROS, dataCurta } from "../_components/comum";
import { AjustarPontos } from "./ajustar-pontos";

export const metadata: Metadata = { title: "Gamificação dos membros" };

const POR_PAGINA = 20;
const COLUNAS: Coluna[] = [
  { titulo: "Aluno" },
  { titulo: "Nível", largura: 140 },
  { titulo: "Pontos", largura: 100 },
  { titulo: "Último ponto", largura: 120 },
  { titulo: "Ações", largura: 170 },
];

type Busca = Promise<Record<string, string | string[] | undefined>>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/** Membros > Gamificação (DONO e ADMIN): saldo (soma do razão), nível e ajuste manual (RN-145). */
async function Gamificacao({ searchParams }: { searchParams: Busca }) {
  const { criador, membro } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  const busca = um(sp.q)?.slice(0, 100);
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(um(sp.pagina) ?? "1", 10) || 1));
  const { total, linhas: alunos, ligada } = await alunosComPontos(criador.id, { busca, pagina, porPagina: POR_PAGINA });
  const href = (n: number) => {
    const p = new URLSearchParams();
    if (busca) p.set("q", busca);
    if (n > 1) p.set("pagina", String(n));
    const qs = p.toString();
    return qs ? `/admin/membros/gamificacao?${qs}` : "/admin/membros/gamificacao";
  };

  const linhas: Linha[] = alunos.map((a) => [
    { tipo: "membro", nome: a.nome, email: a.inativo ? `${a.email} · inativo` : a.email, src: a.imagem },
    { tipo: "texto", texto: a.nivel },
    { tipo: "numeroDestaque", texto: pontosPtBr(a.pontos) },
    { tipo: "data", texto: a.ultimoLancamento ? dataCurta(a.ultimoLancamento) : "—" },
    { tipo: "no", conteudo: <AjustarPontos membroId={a.membroId} nome={a.nome} saldo={a.pontos} /> },
  ]);

  return (
    <div className="flex flex-col gap-4">
      {!ligada && <AvisoDesligada dono={membro.papel === "DONO"} />}
      <PaginaTabela
        titulo="Membros"
        estatistica={`${total} ${total === 1 ? "aluno" : "alunos"} · saldo = soma dos lançamentos (aulas, cursos, avaliações, comunidade, desafios e ajustes)`}
        abas={ABAS_MEMBROS}
        abaAtiva="Gamificação"
        busca="Pesquise por nome ou e-mail..."
        valorBusca={busca}
        formBusca={{ nome: "q" }}
        filtrosAtivos={busca ? [{ rotulo: `Busca · ${busca}`, hrefRemover: "/admin/membros/gamificacao" }] : []}
        colunas={COLUNAS}
        linhas={linhas}
        chaves={alunos.map((a) => a.membroId)}
        paginacao={{ pagina, porPagina: POR_PAGINA, total, href }}
        vazio={busca ? { titulo: "Nenhum aluno encontrado", descricao: "Ajuste a busca." } : { titulo: "Nenhum aluno ainda", descricao: "Os alunos aparecem aqui com o saldo de pontos e o nível." }}
      />
    </div>
  );
}

export default function PaginaGamificacaoMembros({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Gamificacao searchParams={searchParams} />
    </Suspense>
  );
}
