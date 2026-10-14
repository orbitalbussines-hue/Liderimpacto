import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ResponderTentativa } from "@/components/avaliacoes/responder-tentativa";
import { Esqueleto } from "@/components/ui/esqueleto";
import { tentativaParaResponder } from "@/lib/avaliacoes/consultas";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { idSchema } from "@/lib/validators/avaliacoes";

export const metadata: Metadata = { title: "Responder avaliação" };

type Params = Promise<{ id: string; tentativaId: string }>;

async function Conteudo({ params }: { params: Params }) {
  const { id, tentativaId } = await params;
  const q = await membroDaPagina(TODOS_OS_MEMBROS);
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(tentativaId).success) notFound();
  const tela = await tentativaParaResponder(q, tentativaId);
  if (!tela) notFound();
  // Prazo vencido ou já finalizada: o servidor já fechou; vai para o resultado.
  if (tela.situacao === "encerrada") redirect(`/avaliacoes/${id}/resultado/${tela.tentativaId}`);
  if (tela.avaliacao.id !== id) notFound();
  return (
    <ResponderTentativa
      avaliacao={{ id: tela.avaliacao.id, titulo: tela.avaliacao.titulo }}
      tentativa={{ id: tela.tentativa.id, numero: tela.tentativa.numero, segundosRestantes: tela.tentativa.segundosRestantes }}
      questoes={tela.questoes}
    />
  );
}

/**
 * Responder (tela não desenhada no protótipo). UMA questão por vez com o mapa das questões ao lado
 * (embaixo no celular): no celular cabe o enunciado inteiro sem rolar a prova toda, o cronômetro e o
 * "Finalizar" ficam fixos no topo e o mapa mostra o que falta. As respostas vêm do servidor: recarregar
 * não perde nada.
 */
export default function PaginaResponder({ params }: { params: Params }) {
  return (
    <div className="mx-auto max-w-[1100px]">
      <Suspense fallback={<Esqueleto className="h-96 rounded-2xl" />}>
        <Conteudo params={params} />
      </Suspense>
    </div>
  );
}
