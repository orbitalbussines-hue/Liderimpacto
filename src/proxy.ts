import { NextResponse, type NextRequest } from "next/server";
import { alvoDosCabecalhos } from "@/lib/criador/area";

/**
 * Borda (Next 16 `proxy.ts`, runtime Node). NAO e fronteira de seguranca: pagina, action e
 * layout conferem sessao, vinculo e papel por conta propria (guarda.ts / autorizacao.ts).
 * Existe so para a resposta HTTP sair certa ANTES do streaming (com cacheComponents o shell
 * ja saiu com 200 quando a pagina decide):
 *  - host que nao e area nenhuma (criador inexistente/suspenso, slug invalido) -> 404;
 *  - pagina fechada sem NENHUM cookie de sessao -> 307 para /login (presenca do cookie e so
 *    conforto de UX; cookie forjado cai na guarda da pagina);
 *  - apex "/" -> /plataforma.
 */

/**
 * Sem redirect para /login: telas publicas (entrada, definir senha, catalogo de componentes) e
 * `/api/*` — rota de API responde o proprio status (401/403/404); um 307 para uma tela HTML nao
 * serve ao `sendBeacon` do progresso nem ao player. `/certificado/<codigo>` e a verificacao
 * publica do QR do PDF (o host continua validado; `/certificados`, a lista do aluno, NAO e publica).
 */
const PUBLICAS = /^\/(login|primeiro-acesso|recuperar-senha|componentes|api|certificado)(\/|$)/;

// Nome do cookie do Better Auth com `cookiePrefix: "li"` (com ou sem o prefixo __Secure-).
const temCookieDeSessao = (req: NextRequest) => req.cookies.getAll().some((c) => /(^|-)li\.session_token$/.test(c.name));

export async function proxy(req: NextRequest) {
  // ponytail: uma consulta indexada (slug) por navegacao; cache em memoria se virar gargalo.
  const alvo = await alvoDosCabecalhos(req.headers);
  if (!alvo) return new NextResponse(null, { status: 404 });
  const { pathname } = req.nextUrl;
  // Redirect no MESMO host da requisicao (ja validado como area acima), com o protocolo
  // publico da configuracao — atras do nginx, `req.url` traz o endereco interno.
  const origem = `${new URL(process.env.BETTER_AUTH_URL ?? "http://localhost").protocol}//${req.headers.get("host")}`;
  if (alvo.tipo === "plataforma" && pathname === "/") return NextResponse.redirect(new URL("/plataforma", origem));
  if (!PUBLICAS.test(pathname) && !temCookieDeSessao(req)) {
    const login = new URL("/login", origem);
    if (pathname !== "/") login.searchParams.set("de", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  // Tudo menos os arquivos estaticos do Next e os da pasta public.
  // `api/saude` fica de fora: o healthcheck do contêiner chama por 127.0.0.1, que nao e area nenhuma.
  matcher: ["/((?!_next/static|_next/image|api/saude$|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt|woff2?)$).*)"],
};
