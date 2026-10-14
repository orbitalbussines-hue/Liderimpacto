import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { BotaoIniciar } from "@/components/avaliacoes/botao-iniciar";
import { ResultadoTentativa } from "@/components/avaliacoes/resultado-tentativa";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Esqueleto } from "@/components/ui/esqueleto";
import { avaliacaoDoAluno, resultadoDaTentativa } from "@/lib/avaliacoes/consultas";
import { ROTULO_TIPO_AVALIACAO } from "@/lib/avaliacoes/regras";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { idSchema } from "@/lib/validators/avaliacoes";

export const metadata: Metadata = { title: "Resultado da avaliação" };

type Params = Promise<{ id: string; tentativaId: string }>;

async function Conteudo({ params }: { params: Params }) {
  const { id, tentativaId } = await params;
  const q = await membroDaPagina(TODOS_OS_MEMBROS);
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(tentativaId).success) notFound();
  const r = await resultadoDaTentativa(q, tentativaId);
  if (!r || r.avaliacao.id !== id) notFound();
  const card = await avaliacaoDoAluno(q, id);
  return (
    <>
      <CabecalhoPagina eyebrow={`${ROTULO_TIPO_AVALIACAO[r.avaliacao.tipo]} · ${r.avaliacao.curso.titulo}`} titulo={r.avaliacao.titulo} descricao="Resultado da tentativa" />
      <ResultadoTentativa
        avaliacao={{ notaMinima: r.avaliacao.notaMinima, curso: { slug: r.avaliacao.curso.slug } }}
        tentativa={r.tentativa}
        melhorNota={r.melhorNota}
        revelaGabarito={r.revelaGabarito}
        liberouModulo={!!card?.liberaProximoModulo}
        contaParaCertificado={!!card?.obrigatoriaParaCertificado}
        tentarDeNovo={
          r.podeTentarDeNovo && !r.tentativa.aprovada ? (
            <BotaoIniciar avaliacaoId={id} rotulo="Tentar de novo" tempoLimiteMin={card?.tempoLimiteMin ?? null} tentativaAbertaId={card?.tentativaAbertaId ?? null} />
          ) : undefined
        }
        questoes={r.questoes}
      />
    </>
  );
}

/** Resultado de uma tentativa finalizada (só do próprio aluno; a equipe vê qualquer uma do criador). */
export default function PaginaResultado({ params }: { params: Params }) {
  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-6">
      <Suspense fallback={<Esqueleto className="h-80 rounded-2xl" />}>
        <Voltar params={params} />
        <Conteudo params={params} />
      </Suspense>
    </div>
  );
}

async function Voltar({ params }: { params: Params }) {
  const { id } = await params;
  return (
    <Link href={`/avaliacoes/${id}`} className={buttonVariants({ variant: "link", className: "self-start" })}>
      <ArrowLeft aria-hidden />
      Avaliação
    </Link>
  );
}
