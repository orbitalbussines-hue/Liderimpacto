import "server-only";
import { ErroDeNegocio } from "@/lib/acao";
import { chaveDeIp, ipDoCliente } from "@/lib/auth/ip";
import { sessaoDosCabecalhos } from "@/lib/auth/sessao";
import { estourouTeto } from "@/lib/auth/teto";
import { alvoDosCabecalhos } from "@/lib/criador/area";
import { codigoAfiliado, codigoCupom } from "@/lib/validators/pagamentos";
import { idSchema } from "@/lib/validators/membros";
import { registrarCheckoutDaPagina } from "@/lib/paginas/publico";
import { criarCheckout } from "./checkout";
import { TETO_CHECKOUT_POR_IP } from "./regras";
import { gatewayStripe, MSG_PAGAMENTOS_DESLIGADOS, type GatewayStripe } from "./stripe";

/**
 * `GET /api/stripe/checkout?oferta=<id>[&afiliado=<código>][&cupom=<código>]` no host do CRIADOR —
 * o link de compra (e de afiliado). Abre o Checkout hospedado e responde 303 para ele. Visitante
 * pode comprar (o Stripe pede o e-mail; a conta nasce no pagamento); logado nesta área, a compra é
 * dele (e-mail fixo). Teto por IP (20 em 10 min). Afiliado inválido é ignorado; cupom inválido recusa.
 * `pagina=`/`funil=` (botão de preço da página de venda, ADR-0022) só ATRIBUEM a venda; inválidos = ignorados.
 * Sem Next aqui: recebe a `Request` (o teste chama direto).
 */
const SEM_CACHE = { "Cache-Control": "no-store" };
const texto = (status: number, msg: string) => new Response(msg, { status, headers: { ...SEM_CACHE, "Content-Type": "text/plain; charset=utf-8" } });

export async function atenderCompra(req: Request, gateway: GatewayStripe | null = gatewayStripe()): Promise<Response> {
  const alvo = await alvoDosCabecalhos(req.headers);
  if (alvo?.tipo !== "criador") return texto(404, "Área não encontrada.");
  if (!gateway) return texto(503, MSG_PAGAMENTOS_DESLIGADOS);
  const q = new URL(req.url).searchParams;
  const oferta = idSchema.safeParse(q.get("oferta"));
  if (!oferta.success) return texto(404, "Oferta indisponível.");
  const afiliado = codigoAfiliado.safeParse(q.get("afiliado") ?? "");
  const cupom = q.get("cupom") ? codigoCupom.safeParse(q.get("cupom")) : null;
  if (cupom && !cupom.success) return texto(400, "Cupom inválido.");
  if (await estourouTeto(`checkout-ip:${chaveDeIp(ipDoCliente(req.headers))}`, 600, TETO_CHECKOUT_POR_IP)) return texto(429, "Muitas tentativas. Aguarde alguns minutos.");

  const s = await sessaoDosCabecalhos(req.headers);
  const membro = s && !s.provisoria && s.alvo.tipo === "criador" && s.alvo.criador.id === alvo.criador.id ? s.acesso.membro : null;
  try {
    const { vendaId, url } = await criarCheckout(gateway, {
      criador: alvo.criador,
      ofertaId: oferta.data,
      afiliadoCodigo: afiliado.success ? afiliado.data : null,
      cupomCodigo: cupom?.success ? cupom.data : null,
      comprador: membro && s ? { membroId: membro.id, usuarioId: s.userId, email: s.email } : null,
    });
    const id = (v: string | null) => (idSchema.safeParse(v).success ? v : null);
    await registrarCheckoutDaPagina(alvo.criador.id, vendaId, id(q.get("pagina")), id(q.get("funil")));
    return new Response(null, { status: 303, headers: { ...SEM_CACHE, Location: url } });
  } catch (e) {
    if (e instanceof ErroDeNegocio) return texto(400, e.message);
    console.error("[stripe] checkout não aberto:", e instanceof Error ? e.message : e);
    return texto(502, "Não foi possível abrir o pagamento. Tente de novo em instantes.");
  }
}
