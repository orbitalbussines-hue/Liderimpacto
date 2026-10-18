import { alvoDosCabecalhos } from "@/lib/criador/area";
import { RE_SLUG_PAGINA } from "@/lib/paginas/config";
import { paginaPublicada, urlDaImagemDaPagina } from "@/lib/paginas/publico";

/**
 * Imagem de compartilhamento da página PUBLICADA (og:image): link ESTÁVEL que redireciona para a URL
 * assinada do storage (que vence em 1–2 h; o robô da rede social guarda o link desta rota).
 */
export async function GET(req: Request, { params }: RouteContext<"/p/[slug]/imagem">) {
  const { slug } = await params;
  const alvo = await alvoDosCabecalhos(req.headers);
  const pagina = alvo?.tipo === "criador" && RE_SLUG_PAGINA.test(slug) ? await paginaPublicada(alvo.criador.id, slug) : null;
  const url = pagina && alvo?.tipo === "criador" ? await urlDaImagemDaPagina(alvo.criador.id, pagina.config.seo.imagemArquivoId) : null;
  if (!url) return new Response(null, { status: 404 });
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "public, max-age=1800" } });
}
