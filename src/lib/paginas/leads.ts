import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { chaveDeIp } from "@/lib/auth/ip";
import { estourouTeto } from "@/lib/auth/teto";
import { AUTOR_SISTEMA } from "@/lib/conhecimento/regras";
import { db } from "@/lib/db";
import { criadores_leads as leads, criadores_tags } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import type { capturaSchema } from "@/lib/validators/paginas";
import { funilDaPagina, paginaPublicada, proximaEtapa } from "./publico";

/**
 * CAPTURA de lead (RN-243): formulário público da página PUBLICADA, sem login e sem CAPTCHA de terceiro.
 * Defesas: honeypot (campo escondido preenchido = robô: responde "ok" e não grava), teto por IP no banco
 * (10 em 10 min) e consentimento obrigatório. O texto do consentimento e a tag vêm da página PUBLICADA
 * (nunca do corpo). Um lead por e-mail no criador: nova captura atualiza nome, consentimento e data.
 * A trilha não leva o e-mail.
 */

export const TETO_LEADS_POR_IP = 10;
export const MSG_TETO_LEADS = "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
export const MSG_FORMULARIO_INDISPONIVEL = "Este formulário não está mais disponível.";

export type Captura = z.infer<typeof capturaSchema>;
export type ResultadoCaptura = { ok: true; proximaSlug: string | null; funilId: string | null } | { ok: false; erro: string };

export async function capturarLead(criador: { id: string }, slug: string, e: Captura, ip: string, agora = new Date()): Promise<ResultadoCaptura> {
  if (e.site.trim()) return { ok: true, proximaSlug: null, funilId: null };
  if (await estourouTeto(`lead-ip:${chaveDeIp(ip)}`, 600, TETO_LEADS_POR_IP)) return { ok: false, erro: MSG_TETO_LEADS };

  const pagina = await paginaPublicada(criador.id, slug);
  const form = pagina?.id === e.pagina ? pagina.config.blocos.find((b) => b.tipo === "FORMULARIO" && b.visivel) : undefined;
  if (!pagina || !form || form.tipo !== "FORMULARIO") return { ok: false, erro: MSG_FORMULARIO_INDISPONIVEL };
  const [tag] = form.tagId
    ? await db.select({ id: criadores_tags.id }).from(criadores_tags).where(and(eq(criadores_tags.id, form.tagId), eq(criadores_tags.criador_id, criador.id), vivos(criadores_tags)))
    : [];
  const funil = await funilDaPagina(criador.id, e.funil, pagina.id);
  const utm = Object.fromEntries(Object.entries(e.utm).filter(([, v]) => !!v));

  await db.transaction(async (tx) => {
    const [l] = await tx
      .insert(leads)
      .values({
        criador_id: criador.id,
        nome: e.nome,
        email: e.email,
        pagina_id: pagina.id,
        funil_id: funil?.id ?? null,
        tag_id: tag?.id ?? null,
        utm,
        consentimento_texto: form.consentimento,
        consentimento_em: agora,
        ultima_captura_em: agora,
        modified_by: AUTOR_SISTEMA,
      })
      .onConflictDoUpdate({
        target: [leads.criador_id, leads.email],
        targetWhere: sql`is_deleted = false`,
        set: {
          nome: e.nome,
          consentimento_texto: form.consentimento,
          consentimento_em: agora,
          ultima_captura_em: agora,
          capturas: sql`${leads.capturas} + 1`,
          tag_id: sql`coalesce(${tag?.id ?? null}::uuid, ${leads.tag_id})`,
          updated_at: agora,
          modified_by: AUTOR_SISTEMA,
        },
      })
      .returning({ id: leads.id, capturas: leads.capturas });
    await registrarAuditoria(tx, {
      userId: null,
      criadorId: criador.id,
      acao: l.capturas > 1 ? "atualizar" : "criar",
      tabela: "criadores_leads",
      registroId: l.id,
      detalhes: `${l.capturas > 1 ? "Nova captura de lead" : "Lead capturado"} pela página /p/${pagina.slug}${funil ? " (em funil)" : ""}, com consentimento`,
    });
  });
  return { ok: true, proximaSlug: funil ? await proximaEtapa(criador.id, funil) : null, funilId: funil?.id ?? null };
}
