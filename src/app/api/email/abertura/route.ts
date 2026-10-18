import { atenderAbertura } from "@/lib/marketing/rotas";

/** Pixel de abertura dos e-mails de marketing (ADR-0020). Contrato: docs/back.md "Fase 3". */
export async function GET(req: Request) {
  return atenderAbertura(req);
}
