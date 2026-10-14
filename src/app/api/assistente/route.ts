import { clienteIA } from "@/lib/assistente/cliente";
import { responderPorRota } from "@/lib/assistente/rota";

/** Pergunta ao assistente do professor, resposta em streaming NDJSON. Contrato: docs/back.md. */
export async function POST(req: Request) {
  return responderPorRota(req, clienteIA());
}
