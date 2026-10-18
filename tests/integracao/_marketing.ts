/**
 * Apoio dos testes da Fase 3 (campanhas e automações): conteúdo válido, grupo/tag direto no banco e
 * o provedor FALSO ligado (nenhum e-mail sai de verdade). Importar só dentro do teste.
 */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { criadores_grupos, criadores_grupos_membros, criadores_membros_tags, criadores_tags } from "@/lib/db/schema";
import type { ConteudoMarketing } from "@/lib/db/schema/marketing";
import { usarProvedorEmail } from "@/lib/marketing/provedor";
import { ProvedorFalso } from "@/lib/marketing/provedor-falso";

export const conteudo = (extra: Partial<ConteudoMarketing> = {}): ConteudoMarketing => ({
  assunto: "Novidade na área",
  previa: "Uma aula nova",
  titulo: "Tem aula nova",
  corpo: "Oi!\nAssista em https://exemplo.com/aula-nova.\nAté já.",
  botao: { texto: "Abrir", url: "https://exemplo.com/botao" },
  ...extra,
});

export function provedorFalso(): ProvedorFalso {
  const p = new ProvedorFalso();
  usarProvedorEmail(p);
  return p;
}

export async function grupoCom(criadorId: string, membroIds: string[]) {
  const [g] = await db.insert(criadores_grupos).values({ criador_id: criadorId, nome: `Turma ${randomUUID().slice(0, 6)}`, modified_by: criadorId }).returning();
  if (membroIds.length) await db.insert(criadores_grupos_membros).values(membroIds.map((m) => ({ criador_id: criadorId, grupo_id: g.id, membro_id: m, modified_by: criadorId })));
  return g;
}

export async function tagCom(criadorId: string, membroIds: string[]) {
  const [t] = await db.insert(criadores_tags).values({ criador_id: criadorId, nome: `Tag ${randomUUID().slice(0, 6)}`, modified_by: criadorId }).returning();
  if (membroIds.length) await db.insert(criadores_membros_tags).values(membroIds.map((m) => ({ criador_id: criadorId, tag_id: t.id, membro_id: m, modified_by: criadorId })));
  return t;
}

/** Cabeçalhos de uma requisição anônima no host da área (rotas públicas). */
export const hostDe = (slug: string) => new Headers({ host: `${slug}.localhost:3011`, "x-real-ip": "10.9.9.9" });
