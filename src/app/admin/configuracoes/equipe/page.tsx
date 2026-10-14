import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, UserPlus } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { buttonVariants } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import type { PapelCriador } from "@/lib/db/schema/_enums";
import { produtosParaMatricular } from "@/lib/matriculas/consultas";
import { listarGrupos, listarMembros } from "@/lib/membros/consultas";
import { AcoesMembro } from "../../membros/_components/acoes-membro";
import { ROTULO_PAPEL, dataCurta } from "../../membros/_components/comum";

export const metadata: Metadata = { title: "Equipe e acesso" };

/** Quem é equipe (painel admin). Aluno não entra nesta lista. */
const PAPEIS_EQUIPE: readonly PapelCriador[] = ["DONO", "ADMIN"];
const POR_PAGINA = 20;
const COLUNAS: Coluna[] = [
  { titulo: "Pessoa" },
  { titulo: "Papel", largura: 150 },
  { titulo: "Na equipe desde", largura: 130 },
  { titulo: "Último acesso", largura: 120 },
  { titulo: "Ações", largura: 56 },
];

type Busca = Promise<Record<string, string | string[] | undefined>>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/** So DONO: ve DONO e ADMIN, convida admin, muda papel e remove (ultimo DONO protegido na action). */
async function Equipe({ searchParams }: { searchParams: Busca }) {
  const { usuario, criador, membro } = await membroDaPagina(["DONO"]);
  const sp = await searchParams;
  const busca = um(sp.q)?.slice(0, 100);
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(um(sp.pagina) ?? "1", 10) || 1));
  const [lista, todos, grupos, produtos] = await Promise.all([
    listarMembros(criador.id, { busca, papeis: PAPEIS_EQUIPE, pagina, porPagina: POR_PAGINA }),
    listarMembros(criador.id, { papeis: PAPEIS_EQUIPE, pagina: 1, porPagina: 1 }),
    listarGrupos(criador.id),
    produtosParaMatricular(criador.id),
  ]);
  const href = (n?: number, q = busca) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (n && n > 1) p.set("pagina", String(n));
    const qs = p.toString();
    return qs ? `/admin/configuracoes/equipe?${qs}` : "/admin/configuracoes/equipe";
  };

  const ator = { usuarioId: usuario.id, papel: membro.papel };
  const linhas: Linha[] = lista.linhas.map((m) => [
    { tipo: "membro", nome: m.usuarioId === usuario.id ? `${m.nome} (você)` : m.nome, email: m.email, src: m.imagem },
    {
      tipo: "no",
      conteudo: (
        <div className="flex flex-wrap gap-1">
          <Selo tom="accent" forma="etiqueta">
            {ROTULO_PAPEL[m.papel]}
          </Selo>
          {m.status === "INATIVO" && (
            <Selo tom="warn" forma="etiqueta">
              Inativo
            </Selo>
          )}
        </div>
      ),
    },
    { tipo: "data", texto: dataCurta(m.criadoEm) },
    { tipo: "data", texto: m.ultimoAcesso ? dataCurta(m.ultimoAcesso) : "Nunca" },
    {
      tipo: "no",
      conteudo: (
        <AcoesMembro
          membro={{
            id: m.id,
            usuarioId: m.usuarioId,
            nome: m.nome,
            email: m.email,
            imagem: m.imagem,
            papel: m.papel,
            status: m.status,
            versao: m.versao.toISOString(),
            grupoIds: m.grupos.map((g) => g.id),
          }}
          grupos={grupos.map((g) => ({ id: g.id, nome: g.nome }))}
          produtos={produtos.map((p) => ({ id: p.id, titulo: p.titulo, status: p.status }))}
          ator={ator}
        />
      ),
    },
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/configuracoes" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Configurações
      </Link>
      <PaginaTabela
        titulo="Equipe e acesso"
        estatistica={`${todos.total} ${todos.total === 1 ? "pessoa" : "pessoas"} com acesso ao painel · Dono vê tudo; Admin cuida de conteúdo e alunos`}
        abas={[]}
        busca="Pesquise por nome ou e-mail..."
        valorBusca={busca}
        formBusca={{ nome: "q" }}
        filtrosAtivos={busca ? [{ rotulo: `Busca · ${busca}`, hrefRemover: href(1, undefined) }] : []}
        acaoPrincipal={{ rotulo: "Convidar administrador", icone: UserPlus, href: "/admin/configuracoes/equipe/convidar" }}
        colunas={COLUNAS}
        linhas={linhas}
        chaves={lista.linhas.map((m) => m.id)}
        paginacao={{ pagina, porPagina: POR_PAGINA, total: lista.total, href: (n) => href(n) }}
        vazio={{ titulo: "Ninguém encontrado", descricao: "Ajuste a busca." }}
      />
      <p className="m-0 text-xs text-muted">
        Para tornar alguém Dono, use “Mudar papel” no menu da pessoa. A área precisa de pelo menos um Dono ativo. Toda mudança fica na trilha (Configurações › Logs).
      </p>
    </div>
  );
}

export default function PaginaEquipe({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Equipe searchParams={searchParams} />
    </Suspense>
  );
}
