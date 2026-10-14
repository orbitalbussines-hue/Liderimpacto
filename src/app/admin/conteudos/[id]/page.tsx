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
import { equipeDoCriador, produtoParaEditar } from "@/lib/catalogo/consultas";
import { ROTULO_STATUS_PRODUTO, ROTULO_TIPO_PRODUTO, pendenciasParaPublicar } from "@/lib/catalogo/regras";
import { PALETA_PADRAO, validarHex } from "@/lib/marca/paleta";
import { TOM_STATUS_PRODUTO, dataHoraCurta, ehUuid } from "../_components/comum";
import { CapasProduto } from "./_components/capas-produto";
import { DadosProduto } from "./_components/dados-produto";
import { EstruturaProduto } from "./_components/estrutura-produto";
import { SituacaoProduto } from "./_components/situacao-produto";

export const metadata: Metadata = { title: "Editar produto" };

type Params = Promise<{ id: string }>;

async function Editor({ params }: { params: Params }) {
  const { id } = await params;
  const { criador } = await membroDaPagina(EQUIPE);
  if (!ehUuid(id)) notFound();
  const dados = await produtoParaEditar(criador.id, id);
  if (!dados) notFound();
  const { produto } = dados;
  const [equipe, capa3x4, capa16x9] = await Promise.all([
    equipeDoCriador(criador.id),
    urlDeImagemOuNula(criador.id, dados.capa3x4Chave),
    urlDeImagemOuNula(criador.id, dados.capa16x9Chave),
  ]);
  const pendencias = pendenciasParaPublicar({
    titulo: produto.titulo,
    temCapa16x9: !!dados.capa16x9Chave,
    modulosComAula: dados.modulos.filter((m) => m.status === "PUBLICADO" && m.aulas.length > 0).length,
  });
  const versao = produto.updated_at.toISOString();
  const modulos = dados.modulos.map((m) => ({
    id: m.id,
    titulo: m.titulo,
    status: m.status,
    versao: m.updated_at.toISOString(),
    aulas: m.aulas.map((a) => ({ id: a.id, titulo: a.titulo, versao: a.versao.toISOString(), libera: a.liberaEm ? `Libera ${dataHoraCurta(a.liberaEm)}` : null })),
  }));
  // Dado novo do servidor (versões) remonta o estado local da estrutura.
  const assinatura = modulos.map((m) => `${m.id}:${m.versao}:${m.aulas.map((a) => a.versao).join(",")}`).join("|");

  return (
    <>
      <CabecalhoPagina
        variante="admin"
        eyebrow={`Cód. ${produto.codigo} · ${ROTULO_TIPO_PRODUTO[produto.tipo]}`}
        titulo={produto.titulo}
        meta={
          <span className="flex items-center gap-2">
            <Selo tom={TOM_STATUS_PRODUTO[produto.status]}>{ROTULO_STATUS_PRODUTO[produto.status]}</Selo>
            Atualizado em {dataHoraCurta(produto.updated_at)}
          </span>
        }
      />
      <div className="grid items-start gap-5 desk:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Cartao padding={24} como="section" aria-label="Dados do produto">
            <CartaoTitulo tamanho={15} como="h2" className="mb-4">
              Dados
            </CartaoTitulo>
            <DadosProduto
              produto={{
                id: produto.id,
                titulo: produto.titulo,
                slug: produto.slug,
                descricao: produto.descricao,
                tipo: produto.tipo,
                professorMembroId: produto.professor_membro_id,
                corMarca: produto.cor_marca,
                versao,
              }}
              equipe={equipe}
              corDaArea={validarHex(criador.cor_marca ?? "") ?? validarHex(PALETA_PADRAO)!}
            />
          </Cartao>
          <Cartao padding={24} como="section" aria-label="Estrutura do produto">
            <EstruturaProduto key={assinatura} produtoId={produto.id} modulos={modulos} />
          </Cartao>
        </div>
        <aside className="flex min-w-0 flex-col gap-5">
          <Cartao padding={20} como="section" aria-label="Situação do produto">
            <SituacaoProduto key={versao} produto={{ id: produto.id, titulo: produto.titulo, status: produto.status, versao }} pendencias={pendencias} />
          </Cartao>
          <Cartao padding={20} como="section" aria-label="Capas">
            <CartaoTitulo tamanho={15} como="h2" className="mb-4">
              Capas
            </CartaoTitulo>
            <CapasProduto produtoId={produto.id} titulo={produto.titulo} versao={versao} capa3x4={capa3x4} capa16x9={capa16x9} />
          </Cartao>
        </aside>
      </div>
    </>
  );
}

/** Editor do produto do criador do HOST (DONO e ADMIN): dados, estrutura, situação e capas. */
export default function PaginaProduto({ params }: { params: Params }) {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/conteudos" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Conteúdos
      </Link>
      <Suspense fallback={null}>
        <Editor params={params} />
      </Suspense>
    </div>
  );
}
