import { EMAILS_EXEMPLO, MARCAS_EXEMPLO, exemplo, type EmailExemplo, type MarcaExemplo } from "../_exemplos";

/**
 * E-mail de exemplo cru (o HTML exato que sai), para abrir sozinho e tirar print em 600/390 px.
 * `?email=definir-senha|primeiro-acesso|aviso-seguranca&marca=plataforma|clara|escura&formato=texto`.
 * So em desenvolvimento, igual ao /componentes.
 */
export function GET(req: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Não encontrado", { status: 404 });
  const p = new URL(req.url).searchParams;
  const email = p.get("email") ?? "definir-senha";
  const marca = p.get("marca") ?? "plataforma";
  if (!(email in EMAILS_EXEMPLO) || !(marca in MARCAS_EXEMPLO)) return new Response("Exemplo inexistente", { status: 404 });
  const m = exemplo(email as EmailExemplo, marca as MarcaExemplo);
  const texto = p.get("formato") === "texto";
  return new Response(texto ? m.texto : m.html, {
    headers: { "content-type": `${texto ? "text/plain" : "text/html"}; charset=utf-8`, "cache-control": "no-store" },
  });
}
