import { atenderCompra } from "@/lib/pagamentos/rota-compra";

/** Link de compra (e de afiliado) da oferta: abre o Checkout do Stripe. Contrato: docs/back.md. */
export async function GET(req: Request) {
  return atenderCompra(req);
}
