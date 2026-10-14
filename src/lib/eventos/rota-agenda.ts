import "server-only";
import { avaliarMembro } from "@/lib/auth/autorizacao";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { sessaoDosCabecalhos, type SessaoAtiva } from "@/lib/auth/sessao";
import { idSchema } from "@/lib/validators/eventos";
import { gerarIcs, nomeDoIcs } from "./agenda-ics";
import { eventoDoMembro } from "./consultas";
import { ROTA_EVENTOS } from "./regras";

/**
 * `GET /eventos/[id]/agenda.ics` — "Adicionar à agenda", gerado no SERVIDOR. Sessão PLENA do host e
 * membro do criador; o evento passa pela MESMA leitura da página (`eventoDoMembro`: público, rascunho
 * nunca). Sem sessão = 401; fora do público, rascunho, de outro criador ou id inválido = 404. O
 * arquivo não leva o link da sala (RN-142), só o endereço da página.
 */
const SEM_CACHE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export async function atenderAgendaIcs(req: Request, id: string, agora = new Date()): Promise<Response> {
  const s = await sessaoDosCabecalhos(req.headers);
  if (!s || s.provisoria) return new Response("Sessão expirada. Entre novamente.", { status: 401, headers: SEM_CACHE });
  const q = await avaliarMembro(s as SessaoAtiva, TODOS_OS_MEMBROS);
  if (!q) return new Response("Sem permissão.", { status: 403, headers: SEM_CACHE });
  const e = idSchema.safeParse(id).success ? await eventoDoMembro(q, id, agora) : null;
  if (!e) return new Response("Encontro não encontrado.", { status: 404, headers: SEM_CACHE });
  const url = new URL(req.url);
  const corpo = gerarIcs(
    { id: e.id, titulo: e.titulo, descricao: e.descricao, inicioEm: e.inicioEm, fimEm: e.fimEm, cancelado: e.situacao === "CANCELADO", url: `${url.origin}${ROTA_EVENTOS}/${e.id}`, host: url.hostname },
    agora,
  );
  return new Response(corpo, {
    headers: { ...SEM_CACHE, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${nomeDoIcs(e.titulo)}"` },
  });
}
