import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao } from "@/components/ui/cartao";
import { Esqueleto } from "@/components/ui/esqueleto";
import { conversasDoMembro } from "@/lib/assistente/conversas";
import { assistenteDoMembro } from "@/lib/assistente/tela";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { cn } from "@/lib/utils";
import { idSchema } from "@/lib/validators/progresso";
import { ChatDaPagina } from "./_components/chat-da-pagina";

export const metadata: Metadata = { title: "Assistente do professor" };

type Busca = Promise<Record<string, string | string[] | undefined>>;

const quando = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" });

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  const q = await membroDaPagina(TODOS_OS_MEMBROS);
  const sp = await searchParams;
  const c = typeof sp.c === "string" && idSchema.safeParse(sp.c).success ? sp.c : null;
  const [a, conversas] = await Promise.all([assistenteDoMembro(q, c), q.membro.id ? conversasDoMembro(q.criador.id, q.membro.id) : []]);

  return (
    <>
      <CabecalhoPagina variante="aluno" titulo={a.nome} descricao="Respostas a partir das aulas dos seus cursos, com o link para o trecho de onde vieram." />
      <div className="grid items-start gap-5 desk:grid-cols-[300px_minmax(0,1fr)]">
        <Cartao padding={16} como="aside" aria-label="Conversas anteriores" className="order-2 flex flex-col gap-3 desk:order-1">
          <div className="flex items-center justify-between gap-2 px-1">
            <h2 className="m-0 font-sans text-sm font-extrabold tracking-normal">Conversas</h2>
            <Link href="/assistente" className={buttonVariants({ variant: "fantasma", size: "36" })}>
              <Plus aria-hidden />
              Nova
            </Link>
          </div>
          {conversas.length ? (
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {conversas.map((x) => (
                <li key={x.id}>
                  <Link
                    href={`/assistente?c=${x.id}`}
                    aria-current={x.id === a.conversa?.conversaId ? "page" : undefined}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-xl px-3 py-2.5 text-sm hover:bg-surface-2",
                      x.id === a.conversa?.conversaId && "bg-surface-2",
                    )}
                  >
                    <span className="line-clamp-2 font-semibold">{x.titulo}</span>
                    <span className="text-xs text-muted">
                      {quando(x.atualizadaEm)}
                      {x.aulaTitulo ? ` · ${x.aulaTitulo}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 px-1 pb-1 text-sm text-muted">Suas conversas com o assistente ficam guardadas aqui.</p>
          )}
        </Cartao>
        <Cartao padding={20} como="section" className="order-1 desk:order-2">
          <ChatDaPagina key={a.conversa?.conversaId ?? "nova"} nomeAssistente={a.nome} inicial={a.conversa} indisponivel={a.indisponivel} />
        </Cartao>
      </div>
    </>
  );
}

/** Histórico de conversas com o assistente do professor (só as do PRÓPRIO membro, ADR-0014). */
export default function PaginaAssistente({ searchParams }: { searchParams: Busca }) {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <Suspense
        fallback={
          <div aria-busy className="flex flex-col gap-4">
            <span className="sr-only">Carregando…</span>
            <Esqueleto className="h-10 w-72" />
            <Esqueleto className="h-[420px] w-full rounded-2xl" />
          </div>
        }
      >
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
