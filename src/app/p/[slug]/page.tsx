import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BlocosDaPagina } from "@/components/paginas/blocos";
import { MolduraPagina } from "@/components/paginas/moldura-pagina";
import { RegistrarVisita } from "@/components/paginas/registrar-visita";
import { enderecoDaArea } from "@/lib/criador/area";
import { alvoAtual } from "@/lib/criador/atual";
import { RE_SLUG_PAGINA, paragrafos } from "@/lib/paginas/config";
import { dadosParaRender, funilDaPagina, paginaPublicada } from "@/lib/paginas/publico";
import { lerParametros } from "@/lib/paginas/visita";

type Props = PageProps<"/p/[slug]">;

/** A publicada do criador do HOST (rascunho, fora do ar, de outra área = null). */
async function publicada(slug: string) {
  const alvo = await alvoAtual();
  if (alvo?.tipo !== "criador" || !RE_SLUG_PAGINA.test(slug)) return null;
  const pagina = await paginaPublicada(alvo.criador.id, slug);
  return pagina ? { criador: alvo.criador, pagina } : null;
}

/** SEO básico (RN-241): título, descrição, imagem de compartilhamento (link estável) e `noindex` opcional. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const x = await publicada(slug);
  if (!x) return { title: "Página não encontrada", robots: { index: false, follow: false } };
  const { seo, blocos } = x.pagina.config;
  const capa = blocos.find((b) => b.tipo === "CAPA");
  const titulo = seo.titulo || (capa?.tipo === "CAPA" ? capa.titulo : x.pagina.titulo);
  const descricao = seo.descricao || (capa?.tipo === "CAPA" ? paragrafos(capa.subtitulo)[0] : undefined) || undefined;
  const url = `${enderecoDaArea(x.criador.slug).url}/p/${x.pagina.slug}`;
  const imagens = seo.imagemArquivoId ? [{ url: `${url}/imagem`, width: 1200, height: 630 }] : undefined;
  return {
    title: { absolute: `${titulo} · ${x.criador.nome}` },
    description: descricao,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title: titulo, description: descricao, siteName: x.criador.nome, locale: "pt_BR", images: imagens },
    twitter: { card: imagens ? "summary_large_image" : "summary", title: titulo, description: descricao },
    robots: seo.noindex ? { index: false, follow: false } : { index: true, follow: true },
  };
}

async function Pagina({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const x = await publicada(slug);
  if (!x) notFound();
  const { criador, pagina } = x;
  const um = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const visita = lerParametros(um);
  const [funil, dados] = await Promise.all([funilDaPagina(criador.id, visita.funil, pagina.id), dadosParaRender(criador.id, pagina.config)]);
  const ctx = { paginaId: pagina.id, funilId: funil?.id ?? null, cupom: visita.cupom, afiliado: visita.afiliado, utm: visita.utm, previa: false };
  return (
    <MolduraPagina tema={pagina.config.tema} criador={criador}>
      <BlocosDaPagina config={pagina.config} dados={dados} ctx={ctx} slug={pagina.slug} />
      <RegistrarVisita paginaId={pagina.id} funilId={ctx.funilId} />
    </MolduraPagina>
  );
}

/**
 * Página de venda/captura PÚBLICA (RN-241): `/p/<slug>` na área do criador, sem login (o proxy libera
 * `/p/`). Só a versão PUBLICADA; parâmetros da URL (funil, cupom, afiliado, UTM) validados e repassados.
 */
export default function PaginaPublica(props: Props) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
      <Pagina {...props} />
    </Suspense>
  );
}
