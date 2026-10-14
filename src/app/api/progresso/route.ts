import { atenderBeacon } from "@/lib/progresso/beacon";

/** Batida de progresso do player por `navigator.sendBeacon` (pause, fim, troca de aba, saída). Contrato: docs/back.md. */
export async function POST(req: Request) {
  return atenderBeacon(req);
}
