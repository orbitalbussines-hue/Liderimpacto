import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { cursosDoCriador, textoParaEditar } from "@/lib/conhecimento/consultas";
import { ehUuid } from "../../../conteudos/_components/comum";
import { ROTA_BASE } from "../../_components/comum";
import { FormTexto } from "../../_components/form-texto";

export const metadata: Metadata = { title: "Editar texto · Base de conhecimento" };

type Params = Promise<{ id: string }>;
type Busca = Promise<Record<string, string | string[] | undefined>>;

async function Editor({ params, searchParams }: { params: Params; searchParams: Busca }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { criador } = await membroDaPagina(EQUIPE);
  if (!ehUuid(id)) notFound();
  const [t, cursos] = await Promise.all([textoParaEditar(criador.id, id), cursosDoCriador(criador.id)]);
  if (!t) notFound();
  return (
    <>
      <CabecalhoPagina
        variante="admin"
        eyebrow="Texto da equipe"
        titulo={t.titulo}
        meta={<Selo tom={t.incluir ? "ok" : "neutro"}>{t.incluir ? "Incluído na base" : "Fora da base"}</Selo>}
      />
      {sp.criado === "1" && <Aviso tom="ok">Texto criado. O assistente já pode usá-lo nas respostas.</Aviso>}
      <div className="grid items-start gap-5 desk:grid-cols-[minmax(0,1fr)_300px]">
        <Cartao padding={24} como="section" aria-label="Texto da base">
          <FormTexto cursos={cursos} texto={{ id: t.id, titulo: t.titulo, texto: t.texto, produtoId: t.produtoId, versao: t.versao }} />
        </Cartao>
        <Cartao padding={20} como="aside" aria-labelledby="titulo-uso" className="flex flex-col gap-3 text-[13px] leading-relaxed text-muted">
          <CartaoTitulo tamanho={14} id="titulo-uso">
            Como o assistente usa
          </CartaoTitulo>
          <p className="m-0">
            O texto é dividido em {t.trechos === 1 ? "1 trecho" : `${t.trechos} trechos`} de cerca de mil caracteres. Para cada pergunta, o assistente recebe só os trechos mais parecidos com ela.
          </p>
          <p className="m-0">Escreva um assunto por parágrafo e use as palavras que o aluno usaria. Confira em “Testar busca”.</p>
          <Link href={`${ROTA_BASE}/testar`} className={buttonVariants({ variant: "contorno", size: "36", className: "self-start" })}>
            Testar busca
          </Link>
        </Cartao>
      </div>
    </>
  );
}

/** Editar texto da equipe na Base de conhecimento (DONO e ADMIN): salvar com trava, excluir com modal block. */
export default function PaginaEditarTexto({ params, searchParams }: { params: Params; searchParams: Busca }) {
  return (
    <div className="flex flex-col gap-5">
      <Link href={ROTA_BASE} className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Base de conhecimento
      </Link>
      <Suspense fallback={null}>
        <Editor params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
