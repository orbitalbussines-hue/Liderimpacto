import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { urlDeImagemOuNula } from "@/lib/armazenamento/cliente";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { aulaParaEditar } from "@/lib/catalogo/consultas";
import { legendasDaAula } from "@/lib/legendas/consultas";
import { dataHoraCurta, ehUuid } from "../../../_components/comum";
import { BlocoVideoAula } from "./_components/bloco-video-aula";
import { DadosAula } from "./_components/dados-aula";
import { LegendasAula } from "./_components/legendas-aula";
import { MateriaisAula } from "./_components/materiais-aula";
import { ThumbAula } from "./_components/thumb-aula";

export const metadata: Metadata = { title: "Editar aula" };

type Params = Promise<{ id: string; aulaId: string }>;

async function Editor({ params }: { params: Params }) {
  const { id, aulaId } = await params;
  const { criador } = await membroDaPagina(EQUIPE);
  if (!ehUuid(id) || !ehUuid(aulaId)) notFound();
  const dados = await aulaParaEditar(criador.id, id, aulaId);
  if (!dados) notFound();
  const { aula } = dados;
  const versao = aula.updated_at.toISOString();
  const [thumb, legendas] = await Promise.all([urlDeImagemOuNula(criador.id, dados.thumbChave), legendasDaAula(criador.id, aula.id)]);

  return (
    <>
      <Link href={`/admin/conteudos/${id}`} className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        {dados.produtoTitulo}
      </Link>
      <CabecalhoPagina variante="admin" eyebrow={dados.moduloTitulo} titulo={aula.titulo} meta={`Atualizada em ${dataHoraCurta(aula.updated_at)}`} />
      <div className="grid items-start gap-5 desk:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Cartao padding={24} como="section" aria-label="Vídeo da aula">
            <BlocoVideoAula aulaId={aula.id} duracaoSeg={aula.duracao_seg} />
          </Cartao>
          <Cartao padding={24} como="section" aria-label="Dados da aula">
            <CartaoTitulo tamanho={15} como="h2" className="mb-4">
              Dados
            </CartaoTitulo>
            <DadosAula
              key={versao}
              aula={{
                id: aula.id,
                titulo: aula.titulo,
                descricao: aula.descricao,
                liberaEm: aula.libera_em?.toISOString() ?? null,
                preRequisitoAulaId: aula.pre_requisito_aula_id,
                capitulos: aula.capitulos,
                duracaoSeg: aula.duracao_seg,
                versao,
              }}
              aulasDoProduto={dados.aulasDoProduto.filter((a) => a.id !== aula.id)}
            />
          </Cartao>
        </div>
        <aside className="flex min-w-0 flex-col gap-5">
          <Cartao padding={20} como="section" aria-label="Thumb da aula">
            <ThumbAula aulaId={aula.id} titulo={aula.titulo} versao={versao} src={thumb} />
          </Cartao>
          <Cartao padding={20} como="section" aria-label="Legendas">
            <CartaoTitulo tamanho={15} como="h2" className="mb-3">
              Legendas
            </CartaoTitulo>
            <LegendasAula
              aulaId={aula.id}
              duracaoSeg={aula.duracao_seg}
              legendas={legendas.map((l) => ({
                id: l.id,
                idioma: l.idioma,
                rotulo: l.rotulo,
                nomeOriginal: l.nomeOriginal,
                trechos: l.trechos,
                duracaoSeg: l.duracaoSeg,
                versao: l.versao.toISOString(),
              }))}
            />
          </Cartao>
          <Cartao padding={20} como="section" aria-label="Materiais">
            <CartaoTitulo tamanho={15} como="h2" className="mb-3">
              Materiais
            </CartaoTitulo>
            <MateriaisAula
              aulaId={aula.id}
              materiais={dados.materiais.map((m) => ({
                id: m.id,
                nome: m.nome,
                tipo: m.tipo,
                url: m.url,
                arquivoNome: m.arquivoNome,
                arquivoTamanho: m.arquivoTamanho,
                versao: m.versao.toISOString(),
              }))}
            />
          </Cartao>
        </aside>
      </div>
    </>
  );
}

/** Editor da aula do criador do HOST (DONO e ADMIN): vídeo, dados, capítulos, thumb, legendas e materiais. */
export default function PaginaAula({ params }: { params: Params }) {
  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={null}>
        <Editor params={params} />
      </Suspense>
    </div>
  );
}
