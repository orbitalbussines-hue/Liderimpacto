import { atenderInscricao, atenderPreflight } from "@/lib/paginas/rota-inscricao";

/** Inscrição de site externo virando lead (RN-283). Contrato: docs/back.md "Páginas e funis". */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return atenderInscricao(req, (await params).slug);
}

export function OPTIONS() {
  return atenderPreflight();
}
