import "server-only";
import { sessaoDosCabecalhos } from "@/lib/auth/sessao";
import { contarNaoLidas } from "./consultas";

/**
 * `GET /api/notificacoes/contagem` — o sino faz polling (~60 s, só com a aba visível). Sem Next
 * aqui: recebe a `Request` e devolve `Response` (o route handler só repassa; o teste chama direto).
 *
 * - Sessão PLENA do HOST (cookie de outro host/criador não vale: ADR-0003) -> senão 401.
 * - Resposta mínima `{ "naoLidas": n }` (n até 100 = "99+"), `Cache-Control: no-store`.
 * - SUPER_ADMIN sem vínculo no criador: `{ "naoLidas": 0 }` (não recebe notificação).
 * - Recusa NÃO vai para a trilha (polling encheria a trilha, igual ao beacon do progresso).
 */
const SEM_CACHE = { "Cache-Control": "no-store" };

export async function atenderContagem(req: Request): Promise<Response> {
  // Polling automatico: le a sessao SEM renovar o uso (aba esquecida aberta expira em 1 h).
  const s = await sessaoDosCabecalhos(req.headers, { renovar: false });
  if (!s || s.provisoria || s.alvo.tipo !== "criador") return new Response(null, { status: 401, headers: SEM_CACHE });
  const membroId = s.acesso.membro?.id ?? null;
  const naoLidas = membroId ? await contarNaoLidas(s.alvo.criador.id, membroId) : 0;
  return Response.json({ naoLidas }, { headers: SEM_CACHE });
}
