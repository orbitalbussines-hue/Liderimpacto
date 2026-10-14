import "server-only";
import { and, eq } from "drizzle-orm";
import { registrarAuditoriaSegura } from "@/lib/audit/registrar";
import { papelEfetivo } from "@/lib/auth/permissoes";
import { sessaoDosCabecalhos } from "@/lib/auth/sessao";
import { db } from "@/lib/db";
import { produtos_modulos_aulas_legendas as legendas } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { acessoDaAula } from "@/lib/video/acesso-aula";
import { lerObjetoLimitado } from "./servico";

/**
 * `GET /api/legendas/[id]` (ADR-0013): o `.vtt` normalizado só para quem `podeAssistir` a aula —
 * a MESMA decisão do token, da playlist e da chave do vídeo (`acessoDaAula`). Sem Next aqui (o
 * route handler só repassa; o teste chama direto). Sem sessão do HOST = 401; legenda de outro
 * criador ou aula removida = 404; sem acesso = 403 (na trilha, como a chave do vídeo).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nao = (status: 401 | 403 | 404) => new Response(null, { status, headers: { "Cache-Control": "private, no-store" } });
/** O normalizado nunca passa muito do bruto (só o escape de & < >). */
const TETO_BYTES = 4 * 1024 * 1024;

export async function servirLegenda(h: Headers, legendaId: string): Promise<Response> {
  const s = await sessaoDosCabecalhos(h);
  if (!s || s.provisoria) return nao(401);
  if (s.alvo.tipo !== "criador" || !UUID.test(legendaId)) return nao(404);
  const criadorId = s.alvo.criador.id;
  const [l] = await db
    .select({ aulaId: legendas.aula_id, chave: legendas.chave })
    .from(legendas)
    .where(and(eq(legendas.id, legendaId), eq(legendas.criador_id, criadorId), vivos(legendas)));
  if (!l) return nao(404);
  const acesso = await acessoDaAula(criadorId, l.aulaId, { papel: papelEfetivo(s.acesso), membroId: s.acesso.membro?.id ?? null });
  if (!acesso) return nao(404);
  if (!acesso.pode) {
    await registrarAuditoriaSegura({
      userId: s.userId,
      criadorId,
      acao: "acesso_negado",
      tabela: "produtos_modulos_aulas_legendas",
      registroId: legendaId,
      detalhes: `Recusa da legenda: sem permissão para assistir (${acesso.motivo ?? "bloqueio"})`,
    });
    return nao(403);
  }
  let corpo: Buffer;
  try {
    corpo = await lerObjetoLimitado(criadorId, l.chave, TETO_BYTES);
  } catch (e) {
    console.error("[legendas] .vtt não lido do storage:", legendaId, e);
    return nao(404);
  }
  return new Response(new Uint8Array(corpo), {
    headers: {
      "Content-Type": "text/vtt; charset=utf-8",
      // Pessoal (amarrado à sessão), curto: trocar a legenda muda o id e a URL.
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
