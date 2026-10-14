import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Check, Clock3, X } from "lucide-react";
import { BotaoIniciar } from "@/components/avaliacoes/botao-iniciar";
import { dataHora, explicarMotivo, textoTentativas } from "@/components/avaliacoes/formatos";
import { Aviso } from "@/components/ui/aviso";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { Esqueleto } from "@/components/ui/esqueleto";
import { Estatistica } from "@/components/ui/estatistica";
import { avaliacaoDoAluno } from "@/lib/avaliacoes/consultas";
import { formatarNota } from "@/lib/avaliacoes/regras";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { cn } from "@/lib/utils";
import { idSchema } from "@/lib/validators/avaliacoes";

export const metadata: Metadata = { title: "Avaliação" };

type Params = Promise<{ id: string }>;
type Dados = NonNullable<Awaited<ReturnType<typeof avaliacaoDoAluno>>>;

function Tentativas({ a }: { a: Dados }) {
  if (a.tentativas.length === 0) return <p className="m-0 text-[13px] text-muted">Você ainda não fez esta avaliação.</p>;
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {a.tentativas.map((t) => {
        const aberta = !t.finalizadaEm;
        const href = aberta ? `/avaliacoes/${a.id}/tentativa/${t.id}` : `/avaliacoes/${a.id}/resultado/${t.id}`;
        const Icone = aberta ? Clock3 : t.aprovada ? Check : X;
        return (
          <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
            <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-lg", aberta ? "bg-accent-soft text-accent" : t.aprovada ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
              <Icone className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">Tentativa {t.numero}</div>
              <div className="text-xs text-muted">
                <span className={cn("font-bold", aberta ? "text-accent" : t.aprovada ? "text-ok" : "text-warn")}>
                  {aberta ? "Em andamento" : `${formatarNota(t.nota ?? 0)}% · ${t.aprovada ? "aprovada" : "reprovada"}`}
                </span>
                {" · "}
                {dataHora(t.iniciadaEm)}
                {t.finalizadaPor === "TEMPO" && " · tempo esgotado"}
              </div>
            </div>
            <Link href={href} className={buttonVariants({ variant: aberta ? "primario" : "fantasma", size: "36" })}>
              {aberta ? "Continuar" : "Ver resultado"}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

async function Conteudo({ params }: { params: Params }) {
  const { id } = await params;
  const q = await membroDaPagina(TODOS_OS_MEMBROS);
  if (!idSchema.safeParse(id).success) notFound();
  const a = await avaliacaoDoAluno(q, id);
  if (!a) notFound();
  const equipe = q.membro.papel !== "ALUNO";
  const fez = a.tentativas.some((t) => t.finalizadaEm);
  const linkCurso = (
    <Link href={`/cursos/${a.curso.slug}`} className={buttonVariants({ variant: "contorno", size: "46" })}>
      Ir para o curso
    </Link>
  );

  return (
    <>
      <CabecalhoPagina
        eyebrow={`${a.tipoRotulo} · ${a.curso.titulo}`}
        titulo={a.titulo}
        descricao={a.modulo ? `Módulo ${a.modulo.titulo}` : "Avaliação do curso"}
      />
      <div className="grid items-start gap-5 desk:grid-cols-[minmax(0,1fr)_360px]">
        <Cartao padding={24} como="section" aria-label="Antes de começar" className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-2.5 desk:grid-cols-4">
            <Estatistica variante="compacta" valor={a.questoes} rotulo={a.questoes === 1 ? "questão" : "questões"} />
            <Estatistica variante="compacta" valor={a.tempoLimiteMin ? `${a.tempoLimiteMin} min` : "Livre"} rotulo={a.tempoLimiteMin ? "de tempo" : "sem limite de tempo"} />
            <Estatistica variante="compacta" valor={`${a.notaMinima}%`} rotulo="para aprovar" />
            <Estatistica variante="compacta" valor={a.tentativasRestantes === null ? "∞" : a.tentativasRestantes} rotulo={textoTentativas(a.tentativasRestantes).toLowerCase()} />
          </div>
          <div>
            <CartaoTitulo tamanho={15} como="h2">
              Instruções
            </CartaoTitulo>
            <p className="m-0 mt-2 text-sm leading-relaxed whitespace-pre-line text-muted">
              {a.instrucoes || "Leia cada questão com calma. Suas respostas são salvas a cada clique; você pode sair e voltar enquanto a tentativa estiver aberta."}
            </p>
            <ul className="m-0 mt-3 flex list-disc flex-col gap-1 pl-5 text-[13px] text-muted">
              <li>Vale a melhor nota entre as tentativas.</li>
              {a.embaralhar && <li>As questões e as opções aparecem em ordem sorteada.</li>}
              {a.obrigatoriaParaCertificado && <li>A aprovação é exigida para o certificado do curso.</li>}
            </ul>
          </div>
          {equipe && <Aviso>Prévia da equipe: suas tentativas não contam nas estatísticas e não têm limite.</Aviso>}
          {a.aprovada && (
            <Aviso tom="ok">
              Você foi aprovado com <b>{formatarNota(a.melhorNota ?? 0)}%</b>.
            </Aviso>
          )}
          {a.motivo && !a.tentativaAbertaId ? (
            <div className="flex flex-col items-start gap-3">
              <Aviso>{explicarMotivo(a.motivo, { curso: a.curso.titulo, aulasPendentes: a.aulasPendentes, doModulo: !!a.modulo })}</Aviso>
              {(a.motivo === "AULAS_PENDENTES" || a.motivo === "MODULO_BLOQUEADO" || a.motivo === "MATRICULA") && linkCurso}
            </div>
          ) : (
            <BotaoIniciar avaliacaoId={a.id} rotulo={a.aprovada ? "Refazer" : fez ? "Tentar de novo" : "Iniciar avaliação"} tempoLimiteMin={a.tempoLimiteMin} tentativaAbertaId={a.tentativaAbertaId} />
          )}
        </Cartao>
        <Cartao padding={20} como="section" aria-label="Suas tentativas">
          <CartaoTitulo tamanho={15} como="h2" className="mb-3">
            Suas tentativas
          </CartaoTitulo>
          <Tentativas a={a} />
        </Cartao>
      </div>
    </>
  );
}

/** Entrada da avaliação: regras, instruções, histórico de tentativas e Iniciar/Continuar. */
export default function PaginaAvaliacao({ params }: { params: Params }) {
  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-6">
      <Link href="/avaliacoes" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Avaliações
      </Link>
      <Suspense fallback={<Esqueleto className="h-64 rounded-2xl" />}>
        <Conteudo params={params} />
      </Suspense>
    </div>
  );
}
