import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus, Upload } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { matriculasPorMembro, produtosParaMatricular } from "@/lib/matriculas/consultas";
import { FILTROS_SITUACAO, contadoresDeMembros, listarGrupos, listarMembros, type FiltroSituacao } from "@/lib/membros/consultas";
import { AcoesMembro } from "./_components/acoes-membro";
import { ABAS_MEMBROS, ROTULO_PAPEL, dataCurta } from "./_components/comum";
import { FiltrosMembros } from "./_components/filtros-membros";

export const metadata: Metadata = { title: "Membros" };

const POR_PAGINA = 10;
const COLUNAS: Coluna[] = [
  { titulo: "Membro" },
  { titulo: "Grupo", largura: 180 },
  { titulo: "Matrículas", largura: 100 },
  { titulo: "Papel", largura: 150 },
  { titulo: "Criado em", largura: 110 },
  { titulo: "Último acesso", largura: 120 },
  { titulo: "Ações", largura: 56 },
];
const ROTULO_SITUACAO: Record<FiltroSituacao, string> = { ativos: "Ativos", inativos: "Inativos", nunca: "Nunca acessaram" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Busca = Promise<Record<string, string | string[] | undefined>>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

async function Membros({ searchParams }: { searchParams: Busca }) {
  const { usuario, criador, membro } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  // searchParams sao entrada do usuario: so passa o que tem formato conhecido.
  const filtros = {
    busca: um(sp.q)?.slice(0, 100),
    situacao: FILTROS_SITUACAO.find((s) => s === um(sp.situacao)),
    grupoId: UUID.test(um(sp.grupo) ?? "") ? um(sp.grupo) : undefined,
  };
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(um(sp.pagina) ?? "1", 10) || 1));
  const [contadores, lista, grupos, produtos] = await Promise.all([
    contadoresDeMembros(criador.id),
    listarMembros(criador.id, { ...filtros, pagina, porPagina: POR_PAGINA }),
    listarGrupos(criador.id),
    produtosParaMatricular(criador.id),
  ]);
  const matriculas = await matriculasPorMembro(
    criador.id,
    lista.linhas.map((m) => m.id),
    new Date(),
  );

  const href = (mudar: Partial<Record<"q" | "situacao" | "grupo" | "pagina", string | undefined>>) => {
    const p = new URLSearchParams();
    const atual = { q: filtros.busca, situacao: filtros.situacao, grupo: filtros.grupoId, pagina: undefined as string | undefined, ...mudar };
    for (const [k, v] of Object.entries(atual)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/admin/membros?${qs}` : "/admin/membros";
  };
  const grupoAtivo = grupos.find((g) => g.id === filtros.grupoId);
  const filtrosAtivos = [
    filtros.situacao && { rotulo: `Situação · ${ROTULO_SITUACAO[filtros.situacao]}`, hrefRemover: href({ situacao: undefined }) },
    grupoAtivo && { rotulo: `Grupo · ${grupoAtivo.nome}`, hrefRemover: href({ grupo: undefined }) },
    filtros.busca && { rotulo: `Busca · ${filtros.busca}`, hrefRemover: href({ q: undefined }) },
  ].filter((f) => !!f);

  const ator = { usuarioId: usuario.id, papel: membro.papel };
  const linhas: Linha[] = lista.linhas.map((m) => [
    { tipo: "membro", nome: m.nome, email: m.email, src: m.imagem },
    m.grupos.length ? { tipo: "etiqueta", texto: m.grupos.length > 1 ? `${m.grupos[0].nome} +${m.grupos.length - 1}` : m.grupos[0].nome } : { tipo: "texto", texto: "—" },
    { tipo: "numeroDestaque", texto: String(matriculas.get(m.id) ?? 0) },
    {
      tipo: "no",
      conteudo: (
        <div className="flex flex-wrap gap-1">
          <Selo tom={m.papel === "ALUNO" ? "neutro" : "accent"} forma="etiqueta">
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

  const filtrando = Object.values(filtros).some(Boolean);
  return (
    <PaginaTabela
      titulo="Membros"
      estatistica={
        <>
          {contadores.total} total · <b className="text-ok">{contadores.ativos} ativos</b> · {contadores.inativos} inativos · {contadores.nunca} nunca acessaram
        </>
      }
      abas={ABAS_MEMBROS}
      abaAtiva="Membros"
      busca="Pesquise por nome ou e-mail..."
      valorBusca={filtros.busca}
      formBusca={{ nome: "q", manter: Object.fromEntries(Object.entries({ situacao: filtros.situacao, grupo: filtros.grupoId }).filter(([, v]) => v)) as Record<string, string> }}
      filtrosAtivos={filtrosAtivos}
      controles={
        <FiltrosMembros
          situacao={FILTROS_SITUACAO.map((s) => ({ rotulo: ROTULO_SITUACAO[s], href: href({ situacao: s }), marcado: filtros.situacao === s }))}
          grupos={grupos.map((g) => ({ rotulo: g.nome, href: href({ grupo: g.id }), marcado: filtros.grupoId === g.id }))}
        />
      }
      acaoSecundaria={{ rotulo: "Importar CSV", icone: Upload, href: "/admin/membros/importar" }}
      acaoPrincipal={{ rotulo: "Cadastrar", icone: Plus, href: "/admin/membros/cadastrar" }}
      colunas={COLUNAS}
      linhas={linhas}
      chaves={lista.linhas.map((m) => m.id)}
      paginacao={{ pagina, porPagina: POR_PAGINA, total: lista.total, href: (n) => href({ pagina: String(n) }) }}
      vazio={
        filtrando
          ? { titulo: "Nenhum membro encontrado", descricao: "Ajuste a busca ou remova os filtros." }
          : { titulo: "Nenhum membro ainda", descricao: "Cadastre o primeiro membro ou importe uma lista em CSV." }
      }
    />
  );
}

/** Membros do criador do HOST (DONO e ADMIN). Busca, filtros e página na URL. */
export default function PaginaMembros({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Membros searchParams={searchParams} />
    </Suspense>
  );
}
