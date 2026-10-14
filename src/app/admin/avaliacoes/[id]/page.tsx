import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Eye } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { avaliacaoParaEditar } from "@/lib/avaliacoes/admin";
import { metaDaAvaliacao } from "@/lib/avaliacoes/regras";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { ehUuid } from "../../conteudos/_components/comum";
import { CabecalhoAvaliacao } from "./_components/cabecalho-avaliacao";
import { DadosAvaliacao } from "./_components/dados-avaliacao";
import { QuestoesAvaliacao } from "./_components/questoes-avaliacao";
import { SituacaoAvaliacao } from "./_components/situacao-avaliacao";

export const metadata: Metadata = { title: "Editar avaliação" };

type Params = Promise<{ id: string }>;

async function Editor({ params }: { params: Params }) {
  const { id } = await params;
  const { criador } = await membroDaPagina(EQUIPE);
  if (!ehUuid(id)) notFound();
  const dados = await avaliacaoParaEditar(criador.id, id);
  if (!dados) notFound();
  const { avaliacao, modulos, questoes } = dados;
  const c = avaliacao.campos;
  const modulo = modulos.find((m) => m.id === avaliacao.moduloId) ?? null;
  const pendencias = questoes.length === 0 ? ["Cadastrar ao menos 1 questão"] : [];
  const observacoes = modulo?.status === "RASCUNHO" ? [`O módulo "${modulo.titulo}" está em rascunho: a avaliação só aparece para o aluno quando ele for publicado.`] : [];
  // Dado novo do servidor (versões) remonta o estado local das questões.
  const assinatura = questoes.map((q) => `${q.id}:${q.versao}`).join("|");

  return (
    <>
      <CabecalhoAvaliacao
        ativa="Questões e regras"
        avaliacao={{ id: avaliacao.id, titulo: c.titulo, tipo: c.tipo, status: avaliacao.status, curso: avaliacao.produto.titulo, modulo: modulo ? `Módulo ${modulo.ordem} · ${modulo.titulo}` : null }}
      />
      <div className="grid items-start gap-5 desk:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Cartao padding={24} como="section" aria-label="Questões">
            <QuestoesAvaliacao key={assinatura} avaliacaoId={avaliacao.id} publicada={avaliacao.status === "PUBLICADA"} questoes={questoes.map((q) => ({ id: q.id, versao: q.versao, questao: q.questao }))} />
          </Cartao>
          <Cartao padding={24} como="section" aria-label="Dados e regras">
            <CartaoTitulo tamanho={15} como="h2" className="mb-4">
              Dados e regras
            </CartaoTitulo>
            <DadosAvaliacao key={avaliacao.versao} avaliacaoId={avaliacao.id} versao={avaliacao.versao} campos={c} modulos={modulos} />
          </Cartao>
        </div>
        <aside className="flex min-w-0 flex-col gap-5">
          <Cartao padding={20} como="section" aria-label="Situação da avaliação">
            <SituacaoAvaliacao key={avaliacao.versao} avaliacao={{ id: avaliacao.id, titulo: c.titulo, status: avaliacao.status, versao: avaliacao.versao }} pendencias={pendencias} observacoes={observacoes} />
          </Cartao>
          <Cartao padding={20} como="section" aria-label="Como o aluno vê">
            <CartaoTitulo tamanho={15} como="h2">
              Como o aluno vê
            </CartaoTitulo>
            <p className="m-0 mt-1 text-[13px] text-muted">{metaDaAvaliacao({ questoes: questoes.length, tempoLimiteMin: c.tempoLimiteMin, notaMinima: c.notaMinima })}</p>
            <p className="m-0 mt-1 text-[13px] text-muted">
              {c.tentativasMax === 0 ? "Tentativas ilimitadas" : `${c.tentativasMax} ${c.tentativasMax === 1 ? "tentativa" : "tentativas"}`} · vale a melhor nota
            </p>
            <Link href={`/avaliacoes/${avaliacao.id}`} className={buttonVariants({ variant: "contorno", size: "36", className: "mt-4" })}>
              <Eye className="size-3.5" aria-hidden />
              Prévia como aluno
            </Link>
          </Cartao>
        </aside>
      </div>
    </>
  );
}

/** Editor da avaliação do criador do HOST (DONO e ADMIN): questões, dados e regras, situação. */
export default function PaginaAvaliacao({ params }: { params: Params }) {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/avaliacoes" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Avaliações
      </Link>
      <Suspense fallback={null}>
        <Editor params={params} />
      </Suspense>
    </div>
  );
}
