import { atenderClique } from "@/lib/marketing/rotas";

/** Redirect assinado dos links dos e-mails de marketing (ADR-0020). Contrato: docs/back.md "Fase 3". */
export async function GET(req: Request) {
  return atenderClique(req);
}
