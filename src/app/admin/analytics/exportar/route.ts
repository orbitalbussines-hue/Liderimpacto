import { atenderExportacao } from "@/lib/analytics/exportar";

/** CSV de uma aba do Analytics (equipe do criador do host). Contrato: docs/back.md (Analytics). */
export async function GET(req: Request) {
  return atenderExportacao(req);
}
