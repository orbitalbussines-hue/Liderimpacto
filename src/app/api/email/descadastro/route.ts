import { atenderDescadastro } from "@/lib/marketing/rotas";

/**
 * Descadastro sem login. GET (o link do rodapé, já em e-mails enviados) → 303 para a página
 * `/descadastro?t=` no mesmo host (Location relativa: atrás do proxy o `req.url` é o endereço interno).
 * POST efetiva (RFC 8058 "um clique" do cliente de e-mail). Contrato: docs/back.md "Fase 3".
 */
export function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  return new Response(null, {
    status: 303,
    headers: { Location: `/descadastro?${new URLSearchParams({ t })}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

export async function POST(req: Request) {
  return atenderDescadastro(req);
}
