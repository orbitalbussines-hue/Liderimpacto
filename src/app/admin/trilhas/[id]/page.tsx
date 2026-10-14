import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { Selo } from "@/components/ui/selo";
import { urlDeImagemOuNula } from "@/lib/armazenamento/cliente";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { trilhaParaEditar } from "@/lib/trilhas/consultas";
import { dataHoraCurta, ehUuid } from "../../conteudos/_components/comum";
import { FormTrilha } from "../_components/form-trilha";
import { CapaTrilha } from "./_components/capa-trilha";
import { ItensTrilha } from "./_components/itens-trilha";
import { SituacaoTrilha } from "./_components/situacao-trilha";

export const metadata: Metadata = { title: "Editar trilha" };

type Params = Promise<{ id: string }>;

async function Editor({ params }: { params: Params }) {
  const { id } = await params;
  const { criador } = await membroDaPagina(EQUIPE);
  if (!ehUuid(id)) notFound();
  const dados = await trilhaParaEditar(criador.id, id);
  if (!dados) notFound();
  const { trilha, itens, opcoes } = dados;
  const capa = await urlDeImagemOuNula(criador.id, trilha.capaChave);
  const publicada = trilha.status === "PUBLICADA";
  const listaItens = itens.map((i) => ({
    id: i.id,
    versao: i.versao,
    tipo: i.tipo,
    titulo: i.titulo,
    exigeAnterior: i.exigeAnterior,
    alvoEmRascunho: i.statusAlvo === "RASCUNHO",
  }));
  // Versões novas do servidor remontam o estado local da lista (como na estrutura do produto).
  const assinatura = listaItens.map((i) => `${i.id}:${i.versao}`).join("|");

  return (
    <>
      <CabecalhoPagina
        variante="admin"
        eyebrow={trilha.campos.tag || "Trilha"}
        titulo={trilha.campos.titulo}
        meta={
          <span className="flex items-center gap-2">
            <Selo tom={publicada ? "ok" : "neutro"}>{publicada ? "Publicada" : "Rascunho"}</Selo>
            {itens.length} {itens.length === 1 ? "etapa" : "etapas"}
          </span>
        }
        acoes={
          publicada && (
            <Link href={`/trilhas/${trilha.id}`} target="_blank" className={buttonVariants({ variant: "contorno", size: "36" })}>
              Ver como aluno
            </Link>
          )
        }
      />
      <div className="grid items-start gap-5 desk:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Cartao padding={24} como="section" aria-label="Dados da trilha">
            <CartaoTitulo tamanho={15} como="h2" className="mb-4">
              Dados
            </CartaoTitulo>
            <FormTrilha trilha={{ id: trilha.id, versao: trilha.versao, campos: trilha.campos }} />
          </Cartao>
          <Cartao padding={24} como="section" aria-label="Etapas da trilha">
            <ItensTrilha
              key={assinatura}
              trilhaId={trilha.id}
              itens={listaItens}
              opcoes={{
                produtos: opcoes.produtos.filter((p) => p.status !== "RASCUNHO").map((p) => ({ id: p.id, titulo: p.titulo })),
                avaliacoes: opcoes.avaliacoes.filter((a) => a.status === "PUBLICADA").map((a) => ({ id: a.id, titulo: `${a.titulo} · ${a.curso}` })),
                usados: itens.flatMap((i) => [i.produtoId, i.avaliacaoId].filter((x): x is string => !!x)),
              }}
            />
          </Cartao>
        </div>
        <aside className="flex min-w-0 flex-col gap-5">
          <Cartao padding={20} como="section" aria-label="Situação da trilha">
            <SituacaoTrilha
              key={trilha.versao}
              trilha={{ id: trilha.id, titulo: trilha.campos.titulo, status: trilha.status, etapas: itens.length, versao: trilha.versao }}
              publicadaEm={trilha.publicadaEm ? dataHoraCurta(trilha.publicadaEm) : null}
            />
          </Cartao>
          <Cartao padding={20} como="section" aria-label="Capa">
            <CartaoTitulo tamanho={15} como="h2" className="mb-4">
              Capa
            </CartaoTitulo>
            <CapaTrilha trilhaId={trilha.id} titulo={trilha.campos.titulo} versao={trilha.versao} src={capa} />
          </Cartao>
        </aside>
      </div>
    </>
  );
}

/** Editor da trilha do criador do HOST (DONO e ADMIN): dados, etapas, situação e capa. */
export default function PaginaTrilha({ params }: { params: Params }) {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/trilhas" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Trilhas
      </Link>
      <Suspense fallback={null}>
        <Editor params={params} />
      </Suspense>
    </div>
  );
}
