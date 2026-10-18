import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import type { Transacao } from "@/lib/db";
import { criadores_funis as funis, criadores_paginas as paginas } from "@/lib/db/schema";
import type { EtapaFunil } from "@/lib/db/schema/paginas";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";

/** ESCRITA dos funis (RN-245): etapas = páginas DESTE criador, em ordem. Todas `(tx, p)` com trilha. */

const TABELA = "criadores_funis";

async function conferirEtapas(tx: Transacao, criadorId: string, etapas: readonly EtapaFunil[]) {
  const ids = etapas.map((e) => e.paginaId);
  const achadas = await tx.select({ id: paginas.id }).from(paginas).where(and(eq(paginas.criador_id, criadorId), inArray(paginas.id, ids), vivos(paginas)));
  if (achadas.length !== new Set(ids).size) throw new ErroDeNegocio("Página da etapa não encontrada.");
}

const etapasLimpas = (e: readonly EtapaFunil[]) => e.map((x) => ({ paginaId: x.paginaId, nome: x.nome }));

export async function criarFunil(tx: Transacao, p: { criadorId: string; autor: string; nome: string; etapas: EtapaFunil[] }): Promise<{ id: string; versao: Date }> {
  await conferirEtapas(tx, p.criadorId, p.etapas);
  const [f] = await tx.insert(funis).values({ criador_id: p.criadorId, nome: p.nome, etapas: etapasLimpas(p.etapas), modified_by: p.autor }).returning({ id: funis.id, versao: funis.updated_at });
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "criar", tabela: TABELA, registroId: f.id, detalhes: `Criou o funil "${p.nome}" (${p.etapas.length} etapa(s))`, dadosNovos: { etapas: p.etapas } });
  return f;
}

async function travado(tx: Transacao, criadorId: string, funilId: string, versao: Date) {
  const [f] = await tx.select().from(funis).where(and(travaDeColisao(funis, funilId, versao), eq(funis.criador_id, criadorId))).for("update");
  if (!f) throw new ErroDeNegocio(MSG_COLISAO);
  return f;
}

export async function salvarFunil(tx: Transacao, p: { criadorId: string; autor: string; funilId: string; versao: Date; nome: string; etapas: EtapaFunil[] }): Promise<{ versao: Date }> {
  const antes = await travado(tx, p.criadorId, p.funilId, p.versao);
  await conferirEtapas(tx, p.criadorId, p.etapas);
  const [f] = await tx
    .update(funis)
    .set({ nome: p.nome, etapas: etapasLimpas(p.etapas), updated_at: new Date(), modified_by: p.autor })
    .where(and(travaDeColisao(funis, p.funilId, p.versao), eq(funis.criador_id, p.criadorId)))
    .returning({ versao: funis.updated_at });
  if (!f) throw new ErroDeNegocio(MSG_COLISAO);
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "atualizar",
    tabela: TABELA,
    registroId: p.funilId,
    detalhes: `Editou o funil "${p.nome}" (${p.etapas.length} etapa(s))`,
    dadosAnteriores: { nome: antes.nome, etapas: antes.etapas },
    dadosNovos: { nome: p.nome, etapas: p.etapas },
  });
  return f;
}

/** Soft delete: as métricas e os leads já gravados continuam ligados ao funil (histórico). */
export async function excluirFunil(tx: Transacao, p: { criadorId: string; autor: string; funilId: string; versao: Date }): Promise<void> {
  const antes = await travado(tx, p.criadorId, p.funilId, p.versao);
  const [f] = await tx.update(funis).set(marcaDeExclusao(p.autor)).where(and(travaDeColisao(funis, p.funilId, p.versao), eq(funis.criador_id, p.criadorId))).returning({ id: funis.id });
  if (!f) throw new ErroDeNegocio(MSG_COLISAO);
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "excluir", tabela: TABELA, registroId: p.funilId, detalhes: `Excluiu o funil "${antes.nome}"`, dadosAnteriores: { nome: antes.nome, etapas: antes.etapas } });
}
