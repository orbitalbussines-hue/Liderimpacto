import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha, TomSelo } from "@/components/admin/tabela-tipos";
import { MenuFiltro } from "@/components/comunidade/menu-filtro";
import { buttonVariants } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import { SITUACOES_ENTREGA_WEBHOOK, type SituacaoEntregaWebhook } from "@/lib/db/schema/_enums";
import { entregasDoWebhook, listarWebhooks } from "@/lib/webhooks/consultas";
import { ROTULO_EVENTO_WEBHOOK, TENTATIVAS_WEBHOOK } from "@/lib/webhooks/regras";
import { dataHoraCurta, ehUuid } from "../../../conteudos/_components/comum";
import { ReenviarEntrega } from "./reenviar-entrega";

export const metadata: Metadata = { title: "Entregas do webhook" };

const LIMITE = 50;
const COLUNAS: Coluna[] = [
  { titulo: "Quando", largura: 130 },
  { titulo: "Evento", largura: 150 },
  { titulo: "Situação", largura: 110 },
  { titulo: "HTTP", largura: 60 },
  { titulo: "Tentativas", largura: 90 },
  { titulo: "Próxima / entregue", largura: 140 },
  { titulo: "Erro" },
  { titulo: "Ação", largura: 120 },
];
const ROTULO_SITUACAO: Record<SituacaoEntregaWebhook, string> = { PENDENTE: "Pendente", ENTREGUE: "Entregue", FALHOU: "Falhou" };
const TOM_SITUACAO: Record<SituacaoEntregaWebhook, TomSelo> = { PENDENTE: "neutro", ENTREGUE: "ok", FALHOU: "warn" };

type Params = Promise<{ id: string }>;
type Busca = Promise<Record<string, string | string[] | undefined>>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const ehSituacao = (v?: string): v is SituacaoEntregaWebhook => SITUACOES_ENTREGA_WEBHOOK.includes(v as SituacaoEntregaWebhook);
const traco = <span className="text-muted">—</span>;

async function Entregas({ params, searchParams }: { params: Params; searchParams: Busca }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { criador } = await membroDaPagina(["DONO"]);
  if (!ehUuid(id)) notFound();
  const s = um(sp.situacao);
  const situacao = ehSituacao(s) ? s : undefined;
  const [webhooks, entregas] = await Promise.all([listarWebhooks(criador.id), entregasDoWebhook(criador.id, id, { situacao, limite: LIMITE })]);
  const webhook = webhooks.find((w) => w.id === id);
  if (!webhook || !entregas) notFound();
  const ativo = webhook.situacao === "ATIVO";
  const base = `/admin/configuracoes/webhooks/${id}`;

  const linhas: Linha[] = entregas.map((e) => [
    { tipo: "data", texto: dataHoraCurta(e.criadoEm) },
    { tipo: "texto", texto: ROTULO_EVENTO_WEBHOOK[e.evento] },
    { tipo: "no", conteudo: <Selo tom={TOM_SITUACAO[e.situacao]}>{ROTULO_SITUACAO[e.situacao]}</Selo> },
    { tipo: "no", conteudo: e.statusHttp ? <span className="tabular-nums">{e.statusHttp}</span> : traco },
    { tipo: "no", conteudo: <span className="tabular-nums">{`${e.tentativas} de ${TENTATIVAS_WEBHOOK}`}</span> },
    {
      tipo: "no",
      conteudo: e.entregueEm ? (
        <span className="text-xs">Entregue {dataHoraCurta(e.entregueEm)}</span>
      ) : e.proximaTentativaEm ? (
        <span className="text-xs">Próxima {dataHoraCurta(e.proximaTentativaEm)}</span>
      ) : (
        traco
      ),
    },
    { tipo: "no", conteudo: e.erro ? <span className="line-clamp-2 text-xs text-muted" title={e.erro}>{e.erro}</span> : traco },
    {
      tipo: "no",
      conteudo:
        e.situacao !== "FALHOU" ? traco : ativo ? (
          <ReenviarEntrega entregaId={e.id} versao={e.versao.toISOString()} evento={ROTULO_EVENTO_WEBHOOK[e.evento]} />
        ) : (
          <span className="text-xs text-muted">Ative para reenviar</span>
        ),
    },
  ]);

  return (
    <>
      <PaginaTabela
        titulo={webhook.nome}
        estatistica={
          <>
            <span className="break-all">{webhook.url}</span> · {ativo ? "Ativo" : "Pausado"} · últimas {LIMITE} entregas
          </>
        }
        abas={[]}
        semBusca
        filtrosAtivos={situacao ? [{ rotulo: `Situação · ${ROTULO_SITUACAO[situacao]}`, hrefRemover: base }] : []}
        controles={
          <MenuFiltro
            rotulo="Situação"
            itens={[
              { rotulo: "Todas as situações", href: base, marcado: !situacao },
              ...SITUACOES_ENTREGA_WEBHOOK.map((x) => ({ rotulo: ROTULO_SITUACAO[x], href: `${base}?situacao=${x}`, marcado: situacao === x })),
            ]}
          />
        }
        colunas={COLUNAS}
        linhas={linhas}
        chaves={entregas.map((e) => e.id)}
        vazio={
          situacao
            ? { titulo: "Nenhuma entrega nesta situação", descricao: "Remova o filtro para ver todas." }
            : { titulo: "Nenhuma entrega ainda", descricao: "Quando um dos eventos escolhidos acontecer, o envio aparece aqui." }
        }
      />
      <p className="m-0 text-xs text-muted">
        Pendente = na fila ou aguardando nova tentativa. Falhou = esgotou as {TENTATIVAS_WEBHOOK} tentativas (ou o webhook foi pausado antes do envio).
      </p>
    </>
  );
}

/** Entregas de um webhook (RN-204, só DONO): situação, HTTP, tentativas, erro resumido e reenviar. */
export default function PaginaEntregasWebhook({ params, searchParams }: { params: Params; searchParams: Busca }) {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/configuracoes/webhooks" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Integrações e webhooks
      </Link>
      <Suspense fallback={null}>
        <Entregas params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
