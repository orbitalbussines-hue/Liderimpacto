import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { duracaoCurta } from "@/components/aluno/formatos";
import { EtapasTrilha } from "@/components/engajamento/etapas-trilha";
import { EtapaTrilha } from "@/components/trilhas/etapa-trilha";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { buttonVariants } from "@/components/ui/button";
import { Cartao } from "@/components/ui/cartao";
import { EspacoImagem } from "@/components/ui/espaco-imagem";
import { Esqueleto } from "@/components/ui/esqueleto";
import { urlDeImagemOuNula } from "@/lib/armazenamento/cliente";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { trilhaDoAluno } from "@/lib/trilhas/consultas";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Trilha" };

type Params = Promise<{ id: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Trilha({ params }: { params: Params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const q = await membroDaPagina(TODOS_OS_MEMBROS);
  const t = await trilhaDoAluno(q, id);
  if (!t) notFound();
  const capa = await urlDeImagemOuNula(q.criador.id, t.capaChave);
  const prox = t.proximoPasso;
  const podeSeguir = prox && prox.estado !== "bloqueado";
  const duracao = duracaoCurta(t.duracaoSeg);
  return (
    <>
      <Cartao como="section" raio={18} padding={0} aria-labelledby="titulo-trilha" className={cn("grid desk:items-stretch", capa && "desk:grid-cols-[minmax(0,1fr)_380px]")}>
        <div className="flex min-w-0 flex-col gap-3 p-5 desk:p-8">
          {t.tag && <div className="text-[11px] font-bold tracking-[.1em] text-accent uppercase">{t.tag}</div>}
          <h1 id="titulo-trilha" className="m-0 text-[30px] leading-[1.1] desk:text-4xl">
            {t.titulo}
          </h1>
          {t.descricao && <p className="m-0 max-w-[640px] text-sm leading-[1.6] text-muted">{t.descricao}</p>}
          <EtapasTrilha total={t.etapas} concluidas={t.concluidas} estados={t.itens.map((i) => i.estado)} />
          <div className="mt-1 flex flex-col gap-1.5">
            <div className="text-[13px] text-muted">
              {t.textoEtapas}
              {duracao !== "—" && ` · ${duracao}`}
            </div>
            <BarraProgresso valor={t.percentual} mostrarPercentual rotulo="Progresso da trilha" className="max-w-[420px]" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {podeSeguir ? (
              <Link href={prox.href} className={buttonVariants({ size: "42" })}>
                {t.cta === "Iniciar" ? "Iniciar trilha" : "Continuar"}
                <ArrowRight aria-hidden />
              </Link>
            ) : t.cta === "Rever" ? (
              <span className="text-sm font-semibold text-ok">Trilha concluída. Você pode rever qualquer etapa abaixo.</span>
            ) : null}
            {prox && (
              <span className="text-[13px] text-muted">
                Próximo passo: <b className="font-semibold text-text">{prox.titulo}</b>
                {prox.textoMotivo && ` · ${prox.textoMotivo}`}
              </span>
            )}
          </div>
        </div>
        {capa && (
          <div className="relative hidden desk:block">
            <EspacoImagem src={capa} alt="" sizes="380px" />
          </div>
        )}
      </Cartao>

      <section aria-labelledby="titulo-etapas" className="flex flex-col gap-4">
        <h2 id="titulo-etapas" className="m-0 font-sans text-lg font-bold">
          Etapas
        </h2>
        <ol className="m-0 flex flex-col p-0">
          {t.itens.map((i, n) => (
            <EtapaTrilha key={i.id} {...i} ultima={n === t.itens.length - 1} />
          ))}
        </ol>
      </section>
    </>
  );
}

/** Página da trilha: progresso, próximo passo e cada etapa com estado e motivo do bloqueio (RN-126). */
export default function PaginaTrilha({ params }: { params: Params }) {
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <Link href="/trilhas" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Trilhas
      </Link>
      <Suspense
        fallback={
          <div aria-busy className="flex flex-col gap-4">
            <span className="sr-only">Carregando trilha</span>
            <Esqueleto className="h-[280px] rounded-[18px]" />
            <Esqueleto className="h-24 rounded-2xl" />
            <Esqueleto className="h-24 rounded-2xl" />
          </div>
        }
      >
        <Trilha params={params} />
      </Suspense>
    </div>
  );
}
