import { atenderVisita } from "@/lib/paginas/rota-visita";

/** Beacon de visita da página pública (contagem anônima por dia). Contrato: docs/back.md "Páginas e funis". */
export async function POST(req: Request) {
  return atenderVisita(req);
}
