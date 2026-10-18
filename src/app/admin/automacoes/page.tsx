import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { buttonVariants } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { listarAutomacoes } from "@/lib/marketing/consultas";
import { ABAS_AUTOMACOES, descreverAtraso, descreverGatilho } from "./_components/comum";
import { AcoesAutomacao } from "./_components/acoes-automacao";

export const metadata: Metadata = { title: "Automações" };

const COLUNAS: Coluna[] = [
  { titulo: "Automação" },
  { titulo: "Espera", largura: 120 },
  { titulo: "O que faz", largura: 200 },
  { titulo: "Situação", largura: 100 },
  { titulo: "Execuções", largura: 110, alinhar: "direita" },
  { titulo: "Ações", largura: 56 },
];

async function Automacoes() {
  const { criador } = await membroDaPagina(EQUIPE);
  const lista = await listarAutomacoes(criador.id);
  const ativas = lista.filter((a) => a.situacao === "ATIVA").length;

  const linhas: Linha[] = lista.map((a) => [
    {
      tipo: "no",
      conteudo: (
        <div className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <Link href={`/admin/automacoes/${a.id}`} className="truncate font-semibold text-text hover:underline">
              {a.nome}
            </Link>
            {/* No celular a coluna Situação fica fora da tela: o selo vem junto do nome. */}
            {a.situacao === "PAUSADA" && (
              <Selo tom="neutro" className="desk:hidden">
                Pausada
              </Selo>
            )}
          </span>
          <span className="block truncate text-xs text-muted">{descreverGatilho(a.gatilho, a.produto, a.dias)}</span>
        </div>
      ),
    },
    { tipo: "texto", texto: descreverAtraso(a.atrasoMinutos) },
    {
      tipo: "no",
      conteudo: (
        <div className="flex min-w-0 flex-col text-[13px]">
          {a.conteudo && (
            <span className="truncate" title={a.conteudo.assunto}>
              E-mail: {a.conteudo.assunto}
            </span>
          )}
          {a.tag && <span className="truncate text-muted">Tag: {a.tag}</span>}
        </div>
      ),
    },
    { tipo: "no", conteudo: <Selo tom={a.situacao === "ATIVA" ? "ok" : "neutro"}>{a.situacao === "ATIVA" ? "Ativa" : "Pausada"}</Selo> },
    {
      tipo: "no",
      conteudo: (
        <Link href={`/admin/automacoes/historico?automacao=${a.id}`} className="block text-right tabular-nums hover:underline">
          {a.execucoes.toLocaleString("pt-BR")}
          {a.agendadas > 0 && <span className="block text-xs text-muted">{a.agendadas} na espera</span>}
        </Link>
      ),
    },
    { tipo: "no", conteudo: <AcoesAutomacao automacao={{ id: a.id, nome: a.nome, versao: a.versao.toISOString(), situacao: a.situacao, agendadas: a.agendadas }} /> },
  ]);

  return (
    <PaginaTabela
      titulo="Automações"
      estatistica={`${lista.length} ${lista.length === 1 ? "automação" : "automações"} · ${ativas} ${ativas === 1 ? "ativa" : "ativas"} · e-mails e tags que saem sozinhos quando algo acontece`}
      abas={ABAS_AUTOMACOES}
      abaAtiva="Automações"
      semBusca
      acoes={
        <Link href="/admin/automacoes/nova" className={buttonVariants({ size: "36" })}>
          <Plus className="size-3.5" aria-hidden />
          Nova automação
        </Link>
      }
      colunas={COLUNAS}
      linhas={linhas}
      chaves={lista.map((a) => a.id)}
      vazio={{
        titulo: "Nenhuma automação ainda",
        descricao: "Ex.: mande um e-mail de parabéns quando alguém concluir um curso, ou um lembrete para quem está há 14 dias sem entrar.",
      }}
    />
  );
}

/** Automações de e-mail do criador do HOST (RN-224, DONO e ADMIN). */
export default function PaginaAutomacoes() {
  return (
    <Suspense fallback={null}>
      <Automacoes />
    </Suspense>
  );
}
