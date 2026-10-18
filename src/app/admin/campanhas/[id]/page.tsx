import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { MenuFiltro } from "@/components/comunidade/menu-filtro";
import { buttonVariants } from "@/components/ui/button";
import { Cartao } from "@/components/ui/cartao";
import { Estatistica } from "@/components/ui/estatistica";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { urlDaPlataforma } from "@/lib/criador/area";
import { SITUACOES_ENVIO, type SituacaoEnvio } from "@/lib/db/schema/_enums";
import { marcaDaArea } from "@/lib/email/modelo";
import { campanhaDoCriador, destinatariosDaCampanha } from "@/lib/marketing/consultas";
import { ROTULO_SITUACAO_CAMPANHA, ROTULO_SITUACAO_ENVIO, campanhaEditavel } from "@/lib/marketing/regras";
import { dataHoraCurta, ehUuid } from "../../conteudos/_components/comum";
import { AcoesCampanha } from "../_components/acoes-campanha";
import { TOM_SITUACAO_CAMPANHA, TOM_SITUACAO_ENVIO } from "../_components/comum";
import { PreviaEmail } from "../_components/previa-email";

export const metadata: Metadata = { title: "Resultado da campanha" };

const POR_PAGINA = 50;
const COLUNAS: Coluna[] = [
  { titulo: "Pessoa" },
  { titulo: "Situação", largura: 120 },
  { titulo: "Motivo", largura: 220 },
  { titulo: "Enviado em", largura: 140 },
  { titulo: "Abriu", largura: 140 },
  { titulo: "Clicou", largura: 140 },
];

type Params = Promise<{ id: string }>;
type Busca = Promise<Record<string, string | string[] | undefined>>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const traco = <span className="text-muted">—</span>;
const num = (n: number) => n.toLocaleString("pt-BR");

async function Resultado({ params, searchParams }: { params: Params; searchParams: Busca }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { criador } = await membroDaPagina(EQUIPE);
  if (!ehUuid(id)) notFound();
  const situacao = SITUACOES_ENVIO.find((s) => s === um(sp.situacao)) as SituacaoEnvio | undefined;
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(um(sp.pagina) ?? "1", 10) || 1));
  const [c, dest] = await Promise.all([campanhaDoCriador(criador.id, id), destinatariosDaCampanha(criador.id, id, { situacao, pagina, porPagina: POR_PAGINA })]);
  if (!c || !dest) notFound();
  const base = `/admin/campanhas/${id}`;
  const href = (m: { situacao?: string; pagina?: number }) => {
    const p = new URLSearchParams();
    if (m.situacao) p.set("situacao", m.situacao);
    if (m.pagina && m.pagina > 1) p.set("pagina", String(m.pagina));
    const qs = p.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const momento =
    c.situacao === "AGENDADA" && c.agendadaPara
      ? `Agendada para ${dataHoraCurta(c.agendadaPara)}`
      : c.situacao === "CANCELADA" && c.canceladaEm
        ? `Cancelada em ${dataHoraCurta(c.canceladaEm)}`
        : c.concluidaEm
          ? `Concluída em ${dataHoraCurta(c.concluidaEm)}`
          : c.iniciadaEm
            ? `Começou a sair em ${dataHoraCurta(c.iniciadaEm)}`
            : `Criada em ${dataHoraCurta(c.criadoEm)}`;
  const comecou = c.total > 0;

  const linhas: Linha[] = dest.linhas.map((d) => [
    { tipo: "membro", nome: d.nome, email: d.email },
    { tipo: "no", conteudo: <Selo tom={TOM_SITUACAO_ENVIO[d.situacao]}>{ROTULO_SITUACAO_ENVIO[d.situacao]}</Selo> },
    {
      tipo: "no",
      // FALHOU guarda o código técnico do erro: a tela mostra a frase e deixa o código no title.
      conteudo: d.motivo ? <span className="line-clamp-2 text-xs text-muted" title={d.motivo}>{d.situacao === "FALHOU" ? "O servidor de e-mail recusou o envio." : d.motivo}</span> : traco,
    },
    d.enviadoEm ? { tipo: "data", texto: dataHoraCurta(d.enviadoEm) } : { tipo: "no", conteudo: traco },
    d.abertoEm ? { tipo: "data", texto: dataHoraCurta(d.abertoEm) } : { tipo: "no", conteudo: traco },
    d.clicadoEm ? { tipo: "data", texto: `${dataHoraCurta(d.clicadoEm)}${d.cliques > 1 ? ` · ${d.cliques}×` : ""}` } : { tipo: "no", conteudo: traco },
  ]);

  return (
    <>
      <Cartao como="section" aria-label="Resumo da campanha" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-base font-semibold break-words">{c.nome}</h1>
              <Selo tom={TOM_SITUACAO_CAMPANHA[c.situacao]}>{ROTULO_SITUACAO_CAMPANHA[c.situacao]}</Selo>
            </div>
            <p className="m-0 mt-1 text-[13px] text-muted">
              {c.conteudo.assunto} · {momento}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {campanhaEditavel(c.situacao) && (
              <Link href={`${base}/editar`} className={buttonVariants({ variant: "contorno", size: "36" })}>
                <Pencil className="size-3.5" aria-hidden />
                Editar
              </Link>
            )}
            <AcoesCampanha campanha={{ id: c.id, nome: c.nome, situacao: c.situacao, versao: c.versao.toISOString() }} noDetalhe />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Estatistica valor={num(comecou ? c.total : 0)} rotulo="Destinatários" />
          <Estatistica valor={num(c.enviados)} rotulo="Enviados" />
          <Estatistica valor={`${num(c.aberturas)} · ${c.taxaAbertura.toLocaleString("pt-BR")}%`} rotulo="Abriram (estimativa)" />
          <Estatistica valor={`${num(c.cliques)} · ${c.taxaClique.toLocaleString("pt-BR")}%`} rotulo="Clicaram em um link" />
          <Estatistica valor={num(c.pendentes)} rotulo="Na fila" />
          <Estatistica valor={num(c.ignorados)} rotulo="Não enviados" />
          <Estatistica valor={num(c.falhas)} rotulo="Falharam" />
        </div>
        <p className="m-0 text-xs text-muted">
          Aberturas são estimadas: alguns aplicativos de e-mail bloqueiam a imagem que conta a abertura (clique conta como abertura). As porcentagens são sobre os enviados.
          {c.pendentes > 0 && " Os e-mails da fila saem aos poucos, pelo limite de envio por hora."}
        </p>
        <details className="group">
          <summary className="cursor-pointer text-[13px] font-semibold text-accent">Ver o e-mail</summary>
          <PreviaEmail marca={marcaDaArea(criador, urlDaPlataforma())} conteudo={c.conteudo} nome="Ana" className="mt-3 max-w-[640px]" />
        </details>
      </Cartao>

      <PaginaTabela
        titulo="Destinatários"
        estatistica={comecou ? `${num(dest.total)} ${situacao ? `com situação "${ROTULO_SITUACAO_ENVIO[situacao]}"` : "no total"}` : undefined}
        abas={[]}
        semBusca
        filtrosAtivos={situacao ? [{ rotulo: `Situação · ${ROTULO_SITUACAO_ENVIO[situacao]}`, hrefRemover: base }] : []}
        controles={
          comecou ? (
            <MenuFiltro
              rotulo="Situação"
              itens={[
                { rotulo: "Todas", href: base, marcado: !situacao },
                ...SITUACOES_ENVIO.map((s) => ({ rotulo: ROTULO_SITUACAO_ENVIO[s], href: href({ situacao: s }), marcado: situacao === s })),
              ]}
            />
          ) : undefined
        }
        colunas={COLUNAS}
        linhas={linhas}
        chaves={dest.linhas.map((d) => d.envioId)}
        paginacao={{ pagina, porPagina: POR_PAGINA, total: dest.total, href: (n) => href({ situacao, pagina: n }) }}
        vazio={
          situacao
            ? { titulo: "Ninguém nesta situação", descricao: "Remova o filtro para ver todos." }
            : { titulo: "Ainda não saiu", descricao: "A lista de quem recebe é montada na hora em que o envio começa." }
        }
      />
    </>
  );
}

/** Resultado da campanha (RN-220/223): números e cada destinatário com situação e motivo. */
export default function PaginaCampanha({ params, searchParams }: { params: Params; searchParams: Busca }) {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/campanhas" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Campanhas
      </Link>
      <Suspense fallback={null}>
        <Resultado params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
