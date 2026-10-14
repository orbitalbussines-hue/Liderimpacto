import "server-only";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db } from "@/lib/db";
import { produtos_modulos_aulas_videos_sessoes as sessoes } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { JANELA_SESSAO_MS, limiteDeSessoes, sessoesAEncerrar } from "./sessoes";

/**
 * Sessões de reprodução no banco (RN-115). Abrir trava as sessões da PESSOA (advisory lock da
 * transação): dois cliques ao mesmo tempo não furam o limite.
 */

export interface AberturaDeSessao {
  criadorId: string;
  videoId: string;
  usuarioId: string;
  /** Sessão de login: a mesma aba/navegador reabrindo o vídeo reaproveita a sessão. */
  sessaoLoginId: string;
  ip: string;
  userAgent: string;
}

const limiteDoSinal = () => new Date(Date.now() - JANELA_SESSAO_MS);
const vivaDaPessoa = (usuarioId: string) =>
  and(eq(sessoes.usuario_id, usuarioId), isNull(sessoes.encerrada_em), gt(sessoes.ultimo_sinal_em, limiteDoSinal()), vivos(sessoes));

export async function abrirSessaoReproducao(p: AberturaDeSessao): Promise<string> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`video-sessao:${p.usuarioId}`}))`);
    const agora = new Date();
    const vivas = await tx.select().from(sessoes).where(vivaDaPessoa(p.usuarioId));

    const mesma = vivas.find((s) => s.video_id === p.videoId && s.sessao_login_id === p.sessaoLoginId && s.criador_id === p.criadorId);
    if (mesma) {
      await tx.update(sessoes).set({ ultimo_sinal_em: agora, updated_at: agora }).where(eq(sessoes.id, mesma.id));
      return mesma.id;
    }

    const encerrar = sessoesAEncerrar(vivas, limiteDeSessoes());
    if (encerrar.length) {
      await tx
        .update(sessoes)
        .set({ encerrada_em: agora, motivo_encerramento: "LIMITE_DE_TELAS", updated_at: agora, modified_by: p.usuarioId })
        .where(inArray(sessoes.id, encerrar));
    }
    const [nova] = await tx
      .insert(sessoes)
      .values({
        criador_id: p.criadorId,
        video_id: p.videoId,
        usuario_id: p.usuarioId,
        sessao_login_id: p.sessaoLoginId,
        ip: p.ip,
        user_agent: p.userAgent,
        ultimo_sinal_em: agora,
        modified_by: p.usuarioId,
      })
      .returning({ id: sessoes.id });
    await registrarAuditoria(tx, {
      userId: p.usuarioId,
      criadorId: p.criadorId,
      acao: "reproduzir",
      tabela: "produtos_modulos_aulas_videos_sessoes",
      registroId: nova.id,
      detalhes: `Abriu a reprodução do vídeo ${p.videoId}${encerrar.length ? ` (encerrou ${encerrar.length} tela(s) por limite)` : ""}`,
      dadosNovos: { video_id: p.videoId, ip: p.ip, encerradas: encerrar },
    });
    return nova.id;
  });
}

interface SessaoDoToken {
  sessaoId: string;
  videoId: string;
  usuarioId: string;
  criadorId: string;
}

const condicaoDoToken = (s: SessaoDoToken) =>
  and(eq(sessoes.id, s.sessaoId), eq(sessoes.video_id, s.videoId), eq(sessoes.criador_id, s.criadorId), vivaDaPessoa(s.usuarioId));

/** A sessão do token ainda vale (não encerrada pelo limite, com sinal recente)? */
export async function sessaoReproducaoViva(s: SessaoDoToken): Promise<boolean> {
  const [r] = await db.select({ id: sessoes.id }).from(sessoes).where(condicaoDoToken(s));
  return !!r;
}

/** Renova o sinal. `false` = sessão encerrada (outra tela tomou o lugar) ou expirada. */
export async function renovarSessaoReproducao(s: SessaoDoToken): Promise<boolean> {
  const agora = new Date();
  const r = await db.update(sessoes).set({ ultimo_sinal_em: agora, updated_at: agora }).where(condicaoDoToken(s)).returning({ id: sessoes.id });
  return r.length > 0;
}
