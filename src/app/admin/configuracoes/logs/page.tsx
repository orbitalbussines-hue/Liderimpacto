import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha, TomSelo } from "@/components/admin/tabela-tipos";
import { SeletorDatas } from "@/components/admin/seletor-datas";
import { MenuFiltro } from "@/components/comunidade/menu-filtro";
import { buttonVariants } from "@/components/ui/button";
import { entidadesDaTrilha, listarTrilha, type EventoDaTrilha } from "@/lib/audit/consultas";
import type { AcaoAuditada } from "@/lib/audit/registrar";
import { ACOES_AUDITADAS, ROTULO_ACAO, ehAcaoAuditada, ehNomeDeTabela, lerCursor, rotuloEntidade } from "@/lib/audit/regras";
import { membroDaPagina } from "@/lib/auth/guarda";
import { hojeEmBrasilia, lerIntervaloExplicito, textoDoIntervalo } from "@/lib/painel/periodo";
import { dataHoraCurta } from "../../conteudos/_components/comum";

export const metadata: Metadata = { title: "Logs" };

const POR_PAGINA = 30;
const COLUNAS_EVENTOS: Coluna[] = [
  { titulo: "Quando", largura: 130 },
  { titulo: "Pessoa", largura: 180 },
  { titulo: "Ação", largura: 150 },
  { titulo: "Entidade", largura: 150 },
  { titulo: "Detalhes" },
  { titulo: "Registro", largura: 100 },
];
const COLUNAS_EXCLUIDOS: Coluna[] = [
  { titulo: "O que era" },
  { titulo: "Entidade", largura: 150 },
  { titulo: "Excluído por", largura: 180 },
  { titulo: "Quando", largura: 130 },
];
const TOM_ACAO: Partial<Record<AcaoAuditada, TomSelo>> = {
  criar: "ok",
  publicar: "ok",
  excluir: "warn",
  login_recusado: "warn",
  conta_bloqueada: "warn",
  acesso_negado: "warn",
};

type Busca = Promise<Record<string, string | string[] | undefined>>;
type Parametro = "aba" | "q" | "acao" | "entidade" | "de" | "ate" | "depois";
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const pessoa = (e: EventoDaTrilha) => e.pessoa ?? "Anônimo (sem conta)";

function linhaEvento(e: EventoDaTrilha): Linha {
  const acao = ehAcaoAuditada(e.acao) ? e.acao : null;
  return [
    { tipo: "data", texto: dataHoraCurta(e.quando) },
    { tipo: "texto", texto: pessoa(e) },
    { tipo: "selo", texto: acao ? ROTULO_ACAO[acao] : e.acao, tom: (acao && TOM_ACAO[acao]) || "neutro" },
    { tipo: "texto", texto: e.entidade },
    { tipo: "no", conteudo: <span className="line-clamp-2 text-[13px]">{e.detalhes}</span> },
    {
      tipo: "no",
      conteudo: e.registroId ? (
        <code className="text-xs text-muted" title={e.registroId}>
          {e.registroId.slice(0, 8)}
        </code>
      ) : (
        <span className="text-muted">—</span>
      ),
    },
  ];
}

function linhaExcluido(e: EventoDaTrilha): Linha {
  return [
    {
      tipo: "no",
      conteudo: (
        <div className="min-w-0">
          <span className="block truncate font-semibold">{e.titulo ?? e.entidade}</span>
          <span className="line-clamp-2 text-xs text-muted">{e.detalhes}</span>
        </div>
      ),
    },
    { tipo: "texto", texto: e.entidade },
    { tipo: "texto", texto: pessoa(e) },
    { tipo: "data", texto: dataHoraCurta(e.quando) },
  ];
}

async function Logs({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(["DONO"]);
  const sp = await searchParams;
  // searchParams sao entrada do usuario: so passa o que tem formato conhecido.
  const excluidos = um(sp.aba) === "excluidos";
  const acao = um(sp.acao);
  const entidade = um(sp.entidade);
  // Sem `de`/`ate` válidos = desde o início (o padrão dos Logs, diferente do painel).
  const hoje = hojeEmBrasilia();
  const periodo = lerIntervaloExplicito({ de: um(sp.de), ate: um(sp.ate) }, hoje);
  const filtros = {
    q: um(sp.q)?.slice(0, 100),
    acao: !excluidos && ehAcaoAuditada(acao) ? acao : undefined,
    entidade: ehNomeDeTabela(entidade) ? entidade : undefined,
    de: periodo?.de,
    ate: periodo?.ate,
  };
  const cursor = lerCursor(um(sp.depois));
  const [pagina, entidades] = await Promise.all([
    listarTrilha(criador.id, {
      pessoa: filtros.q,
      acao: filtros.acao,
      tabela: filtros.entidade,
      periodo: periodo ?? undefined,
      somenteExclusoes: excluidos,
      cursor,
      limite: POR_PAGINA,
    }),
    entidadesDaTrilha(criador.id),
  ]);

  const href = (mudar: Partial<Record<Parametro, string | undefined>>) => {
    const p = new URLSearchParams();
    const atual: Partial<Record<Parametro, string | undefined>> = { aba: excluidos ? "excluidos" : undefined, ...filtros, depois: undefined, ...mudar };
    for (const [k, v] of Object.entries(atual)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/admin/configuracoes/logs?${qs}` : "/admin/configuracoes/logs";
  };
  const filtrosAtivos = [
    filtros.acao && { rotulo: `Ação · ${ROTULO_ACAO[filtros.acao]}`, hrefRemover: href({ acao: undefined }) },
    filtros.entidade && { rotulo: `Entidade · ${rotuloEntidade(filtros.entidade)}`, hrefRemover: href({ entidade: undefined }) },
    periodo && { rotulo: `Período · ${textoDoIntervalo(periodo.de, periodo.ate)}`, hrefRemover: href({ de: undefined, ate: undefined }) },
    filtros.q && { rotulo: `Pessoa · ${filtros.q}`, hrefRemover: href({ q: undefined }) },
  ].filter((f) => !!f);
  const manter = Object.fromEntries(
    Object.entries({ aba: excluidos ? "excluidos" : undefined, acao: filtros.acao, entidade: filtros.entidade, de: filtros.de, ate: filtros.ate }).filter(([, v]) => v),
  ) as Record<string, string>;
  const filtrando = Object.values(filtros).some(Boolean) || !!cursor;
  const vazioSemFiltro = excluidos
    ? { titulo: "Nenhuma exclusão registrada", descricao: "Quando alguém excluir um registro, ele aparece aqui com quem excluiu e quando." }
    : { titulo: "Nenhum evento ainda", descricao: "As ações da equipe e dos alunos nesta área aparecem aqui." };

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/configuracoes" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Configurações
      </Link>
      <PaginaTabela
        titulo="Logs"
        estatistica="Trilha de auditoria somente leitura · e-mails e IPs aparecem mascarados"
        abas={[
          { rotulo: "Eventos", href: href({ aba: undefined }) },
          { rotulo: "Excluídos", href: href({ aba: "excluidos", acao: undefined }) },
        ]}
        abaAtiva={excluidos ? "Excluídos" : "Eventos"}
        busca="Pesquise pelo nome da pessoa..."
        valorBusca={filtros.q}
        formBusca={{ nome: "q", manter }}
        filtrosAtivos={filtrosAtivos}
        controles={
          <>
            {!excluidos && (
              <MenuFiltro
                rotulo="Ação"
                itens={[
                  { rotulo: "Todas as ações", href: href({ acao: undefined }), marcado: !filtros.acao },
                  ...ACOES_AUDITADAS.map((a) => ({ rotulo: ROTULO_ACAO[a], href: href({ acao: a }), marcado: filtros.acao === a })),
                ]}
              />
            )}
            {entidades.length > 0 && (
              <MenuFiltro
                rotulo="Entidade"
                itens={[
                  { rotulo: "Todas as entidades", href: href({ entidade: undefined }), marcado: !filtros.entidade },
                  ...entidades.map((e) => ({ rotulo: e.rotulo, href: href({ entidade: e.tabela }), marcado: filtros.entidade === e.tabela })),
                ]}
              />
            )}
            {/* "Atualizar" troca de/ate e volta à 1ª página (o cursor não vai junto); limpar = remover o chip "Período". */}
            <SeletorDatas
              valor={periodo}
              hoje={hoje}
              caminho="/admin/configuracoes/logs"
              manter={{ aba: excluidos ? "excluidos" : undefined, acao: filtros.acao, entidade: filtros.entidade, q: filtros.q }}
            />
          </>
        }
        colunas={excluidos ? COLUNAS_EXCLUIDOS : COLUNAS_EVENTOS}
        linhas={pagina.linhas.map(excluidos ? linhaExcluido : linhaEvento)}
        chaves={pagina.linhas.map((e) => e.id)}
        vazio={filtrando ? { titulo: "Nenhum registro encontrado", descricao: "Ajuste a busca ou remova os filtros." } : vazioSemFiltro}
      />
      {(cursor || pagina.proximo) && (
        <nav aria-label="Paginação da trilha" className="flex flex-wrap justify-end gap-2">
          {cursor && (
            <Link href={href({})} className={buttonVariants({ variant: "contorno", size: "36" })}>
              Mais recentes
            </Link>
          )}
          {pagina.proximo && (
            <Link href={href({ depois: pagina.proximo })} className={buttonVariants({ variant: "contorno", size: "36" })}>
              Mais antigos
              <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

/** Trilha de auditoria do criador do HOST (só DONO; ADMIN e ALUNO recebem 403 na trilha). */
export default function PaginaLogs({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Logs searchParams={searchParams} />
    </Suspense>
  );
}
