/**
 * Apoio dos testes do passo 8 (PostgreSQL real): canal montado direto no banco, arquivo da
 * comunidade DISPONÍVEL (sem objeto no storage; o envio real é provado em armazenamento.test.ts) e
 * o `Participante` de um membro. Importar só dentro do teste (depois do _ambiente.ts).
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { chaveDeArquivo } from "@/lib/armazenamento/regras";
import type { Participante } from "@/lib/comunidade/sql";
import { db } from "@/lib/db";
import type { AcessoCanal, PapelCriador, QuemPostaCanal } from "@/lib/db/schema/_enums";
import { arquivos, criadores_canais, criadores_grupos, criadores_grupos_membros, criadores_membros_notificacoes } from "@/lib/db/schema";

export async function canal(criadorId: string, o: { nome?: string; acesso?: AcessoCanal; grupoId?: string; produtoId?: string; quemPosta?: QuemPostaCanal } = {}) {
  const [c] = await db
    .insert(criadores_canais)
    .values({
      criador_id: criadorId,
      nome: o.nome ?? `Canal ${randomUUID().slice(0, 6)}`,
      acesso: o.acesso ?? "TODOS",
      grupo_id: o.grupoId ?? null,
      produto_id: o.produtoId ?? null,
      quem_posta: o.quemPosta ?? "TODOS",
      modified_by: criadorId,
    })
    .returning();
  return c;
}

export async function grupoCom(criadorId: string, membroIds: string[]) {
  const [g] = await db.insert(criadores_grupos).values({ criador_id: criadorId, nome: `Grupo ${randomUUID().slice(0, 6)}`, tipo: "ACESSO", modified_by: criadorId }).returning();
  for (const m of membroIds) await db.insert(criadores_grupos_membros).values({ criador_id: criadorId, grupo_id: g.id, membro_id: m, modified_by: criadorId });
  return g;
}

export const participante = (criadorId: string, p: { usuario: { id: string; nome: string }; membro: { id: string; papel: PapelCriador } }): Participante => ({
  criadorId,
  usuarioId: p.usuario.id,
  membroId: p.membro.id,
  papel: p.membro.papel,
  nome: p.usuario.nome,
});

/** Arquivo da comunidade já confirmado, enviado por `usuarioId`. */
export async function anexoPronto(criadorId: string, usuarioId: string, tipo: "IMAGEM" | "PDF" | "CATALOGO" = "IMAGEM") {
  const id = randomUUID();
  const finalidade = tipo === "IMAGEM" ? "COMUNIDADE_IMAGEM" : tipo === "PDF" ? "COMUNIDADE_PDF" : "IMAGEM";
  const [mime, ext] = tipo === "PDF" ? ["application/pdf", "pdf"] : ["image/png", "png"];
  const [a] = await db
    .insert(arquivos)
    .values({ id, criador_id: criadorId, chave: chaveDeArquivo(criadorId, finalidade, id, ext), finalidade, nome_original: `anexo.${ext}`, mime, tamanho_bytes: 999, status: "DISPONIVEL", modified_by: usuarioId })
    .returning();
  return a;
}

export async function notificacoesDe(membroId: string) {
  return db.select().from(criadores_membros_notificacoes).where(and(eq(criadores_membros_notificacoes.membro_id, membroId), eq(criadores_membros_notificacoes.is_deleted, false)));
}
