import { atenderAgendaIcs } from "@/lib/eventos/rota-agenda";

/** "Adicionar à agenda" (.ics) do encontro, só para quem vê o encontro. Contrato: docs/back.md (Eventos ao vivo). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return atenderAgendaIcs(req, (await params).id);
}
