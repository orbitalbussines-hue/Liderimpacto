import { atenderContagem } from "@/lib/notificacoes/rota";

/** Contador de notificações não lidas do sino (polling leve). Contrato: docs/back.md. */
export async function GET(req: Request) {
  return atenderContagem(req);
}
