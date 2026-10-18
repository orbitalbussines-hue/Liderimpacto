import { receberEventoIntegracao } from "@/lib/integracoes/receber";
import { TAMANHO_MAXIMO_CORPO } from "@/lib/integracoes/regras";

/**
 * Webhook da Hotmart (`/api/integracoes/hotmart/<id>`) e da Eduzz (`/api/integracoes/eduzz/<id>`),
 * ADR-0021. Público no apex (`/api/*` passa no proxy); a credencial é o `X-HOTMART-HOTTOK` ou a
 * `x-signature` (HMAC do corpo CRU), conferidos em tempo constante. Responde rápido: grava o recibo
 * e enfileira (worker `worker:certificados`). Contrato: docs/back.md "Integrações".
 */
export async function POST(req: Request, ctx: { params: Promise<{ plataforma: string; id: string }> }) {
  const { plataforma, id } = await ctx.params;
  if (Number(req.headers.get("content-length") ?? 0) > TAMANHO_MAXIMO_CORPO) return Response.json({ recebido: false, erro: "Corpo grande demais." }, { status: 413 });
  const r = await receberEventoIntegracao({ segmento: plataforma, integracaoId: id, corpo: await req.text(), cabecalhos: req.headers });
  return Response.json(r.corpo, { status: r.status });
}
