import { atenderExportacaoLeads } from "@/lib/paginas/exportar-leads";

/** CSV dos leads (DONO e ADMIN do criador do host). Contrato: docs/back.md (Páginas e funis). */
export async function GET(req: Request) {
  return atenderExportacaoLeads(req);
}
