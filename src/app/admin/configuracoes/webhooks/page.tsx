import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { buttonVariants } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import { listarWebhooks } from "@/lib/webhooks/consultas";
import { MAX_WEBHOOKS_POR_CRIADOR, ROTULO_EVENTO_WEBHOOK } from "@/lib/webhooks/regras";
import { dataHoraCurta } from "../../conteudos/_components/comum";
import { AcoesWebhook } from "./_components/acoes-webhook";
import { ComoValidar } from "./_components/como-validar";
import { BotaoNovoWebhook } from "./_components/dialogo-webhook";

export const metadata: Metadata = { title: "Integrações e webhooks" };

const COLUNAS: Coluna[] = [
  { titulo: "Webhook" },
  { titulo: "Eventos", largura: 240 },
  { titulo: "Situação", largura: 110 },
  { titulo: "Segredo", largura: 110 },
  { titulo: "Criado em", largura: 130 },
  { titulo: "Ações", largura: 56 },
];

async function Webhooks() {
  const { criador } = await membroDaPagina(["DONO"]);
  const lista = await listarWebhooks(criador.id);
  const ativos = lista.filter((w) => w.situacao === "ATIVO").length;

  const linhas: Linha[] = lista.map((w) => [
    {
      tipo: "no",
      conteudo: (
        <div className="min-w-0">
          <Link href={`/admin/configuracoes/webhooks/${w.id}`} className="block truncate font-semibold text-text hover:underline">
            {w.nome}
          </Link>
          <span className="block truncate text-xs text-muted" title={w.url}>
            {w.url}
          </span>
        </div>
      ),
    },
    {
      tipo: "no",
      conteudo: (
        <span className="line-clamp-2 text-[13px]" title={w.eventos.map((e) => ROTULO_EVENTO_WEBHOOK[e]).join(", ")}>
          {w.eventos.map((e) => ROTULO_EVENTO_WEBHOOK[e]).join(", ")}
        </span>
      ),
    },
    { tipo: "no", conteudo: <Selo tom={w.situacao === "ATIVO" ? "ok" : "neutro"}>{w.situacao === "ATIVO" ? "Ativo" : "Pausado"}</Selo> },
    { tipo: "no", conteudo: <code className="text-xs text-muted">••••{w.segredoFinal}</code> },
    { tipo: "data", texto: dataHoraCurta(w.criadoEm) },
    {
      tipo: "no",
      conteudo: (
        <AcoesWebhook
          webhook={{ id: w.id, nome: w.nome, url: w.url, eventos: w.eventos, versao: w.versao.toISOString() }}
          situacao={w.situacao}
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
        titulo="Integrações e webhooks"
        estatistica={`${lista.length} de ${MAX_WEBHOOKS_POR_CRIADOR} webhooks · ${ativos} ${ativos === 1 ? "ativo" : "ativos"} · eventos da área enviados para outros sistemas`}
        abas={[]}
        semBusca
        acoes={<BotaoNovoWebhook quantidade={lista.length} />}
        colunas={COLUNAS}
        linhas={linhas}
        chaves={lista.map((w) => w.id)}
        vazio={{ titulo: "Nenhum webhook ainda", descricao: "Crie um para avisar outro sistema (CRM, planilha, automação) quando alguém se matricular ou concluir um curso." }}
      />
      <ComoValidar />
    </div>
  );
}

/** Webhooks de saída do criador do HOST (RN-204, só DONO; ADMIN e ALUNO recebem 403). */
export default function PaginaWebhooks() {
  return (
    <Suspense fallback={null}>
      <Webhooks />
    </Suspense>
  );
}
