import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import type { Transacao } from "@/lib/db";
import type { PapelCriador } from "@/lib/db/schema/_enums";
import { criadores_grupos, criadores_grupos_membros, criadores_membros, usuarios } from "@/lib/db/schema";
import { marcaDeExclusao, vivos } from "@/lib/db/soft-delete";

/**
 * Escrita de vinculos pessoa x criador e de grupos, usada pelas actions de membros, da
 * importacao e da plataforma (novo criador). SEMPRE dentro da transacao de quem chama, com o
 * `criadorId` do HOST (ou o recem-criado pela plataforma) — nunca de input.
 */

/** Postgres 23505 (unique) — o Drizzle embrulha o erro do driver em `cause`. */
export function violouUnico(e: unknown): boolean {
  const codigo = (x: unknown) => (x as { code?: unknown } | null)?.code;
  return codigo(e) === "23505" || codigo((e as { cause?: unknown } | null)?.cause) === "23505";
}

export type ResultadoVinculo =
  | { tipo: "ja-membro" }
  | { tipo: "vinculado"; usuarioId: string; membroId: string; identidadeNova: boolean };

/**
 * Identidade global (ADR-0002): e-mail que ja existe na plataforma e REAPROVEITADO (nome e senha
 * da pessoa ficam como estao; nada de outros criadores e lido ou devolvido). Senao, cria a
 * conta SEM senha (primeiro acesso pelo link). A trilha e gravada ANTES do vinculo (o id e
 * gerado aqui): dar papel, sobretudo DONO, e conceder poder.
 */
export async function vincularPessoa(
  tx: Transacao,
  p: { criadorId: string; autorId: string; nome: string; email: string; papel: PapelCriador },
): Promise<ResultadoVinculo> {
  const email = p.email.toLowerCase();
  const [existente] = await tx
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(sql`lower(${usuarios.email}) = ${email}`, vivos(usuarios)));

  let usuarioId = existente?.id;
  if (!usuarioId) {
    usuarioId = randomUUID();
    await registrarAuditoria(tx, {
      userId: p.autorId,
      criadorId: p.criadorId,
      acao: "criar",
      tabela: "usuarios",
      registroId: usuarioId,
      detalhes: `Criou a conta de ${p.nome} (sem senha: primeiro acesso pelo link)`,
      dadosNovos: { nome: p.nome, email },
    });
    await tx.insert(usuarios).values({ id: usuarioId, nome: p.nome, email, modified_by: p.autorId });
  } else {
    const [vinculo] = await tx
      .select({ id: criadores_membros.id })
      .from(criadores_membros)
      .where(and(eq(criadores_membros.criador_id, p.criadorId), eq(criadores_membros.usuario_id, usuarioId), vivos(criadores_membros)));
    if (vinculo) return { tipo: "ja-membro" };
  }

  const membroId = randomUUID();
  await registrarAuditoria(tx, {
    userId: p.autorId,
    criadorId: p.criadorId,
    acao: "criar",
    tabela: "criadores_membros",
    registroId: membroId,
    detalhes: `Vinculou ${email} como ${p.papel}${existente ? " (conta já existente na plataforma)" : ""}`,
    dadosNovos: { usuario_id: usuarioId, papel: p.papel, status: "ATIVO" },
  });
  await tx.insert(criadores_membros).values({
    id: membroId,
    criador_id: p.criadorId,
    usuario_id: usuarioId,
    papel: p.papel,
    status: "ATIVO",
    modified_by: p.autorId,
  });
  return { tipo: "vinculado", usuarioId, membroId, identidadeNova: !existente };
}

/**
 * Quantos DONOS ativos o criador tem, com TRAVA nas linhas (`FOR UPDATE`): dois DONOS se
 * rebaixando ao mesmo tempo nao deixam a area sem dono — o segundo espera e ve a contagem nova.
 */
export async function donosAtivosComTrava(tx: Transacao, criadorId: string): Promise<number> {
  const linhas = await tx
    .select({ id: criadores_membros.id })
    .from(criadores_membros)
    .where(
      and(
        eq(criadores_membros.criador_id, criadorId),
        eq(criadores_membros.papel, "DONO"),
        eq(criadores_membros.status, "ATIVO"),
        vivos(criadores_membros),
      ),
    )
    .for("update");
  return linhas.length;
}

/** Nomes dos grupos (vivos) do criador por id; id de outro criador ou removido = erro. */
async function gruposDoCriador(tx: Transacao, criadorId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const linhas = await tx
    .select({ id: criadores_grupos.id, nome: criadores_grupos.nome })
    .from(criadores_grupos)
    .where(and(eq(criadores_grupos.criador_id, criadorId), inArray(criadores_grupos.id, ids), vivos(criadores_grupos)));
  if (linhas.length !== new Set(ids).size) throw new ErroDeNegocio("Grupo inválido. Recarregue a página.");
  return new Map(linhas.map((g) => [g.id, g.nome]));
}

/**
 * Deixa o membro EXATAMENTE nos grupos pedidos: retira (soft delete) os que sairam e insere os
 * novos. Devolve os nomes antes e depois para a trilha. A FK composta do banco tambem recusa
 * grupo e membro de criadores diferentes.
 */
export async function definirGruposDoMembro(
  tx: Transacao,
  p: { criadorId: string; membroId: string; grupoIds: string[]; autorId: string },
): Promise<{ antes: string[]; depois: string[] }> {
  const pedidos = await gruposDoCriador(tx, p.criadorId, p.grupoIds);
  const atuais = await tx
    .select({ id: criadores_grupos_membros.id, grupoId: criadores_grupos_membros.grupo_id, nome: criadores_grupos.nome })
    .from(criadores_grupos_membros)
    .innerJoin(criadores_grupos, eq(criadores_grupos.id, criadores_grupos_membros.grupo_id))
    .where(
      and(
        eq(criadores_grupos_membros.criador_id, p.criadorId),
        eq(criadores_grupos_membros.membro_id, p.membroId),
        vivos(criadores_grupos_membros),
      ),
    );
  const sair = atuais.filter((a) => !pedidos.has(a.grupoId));
  const entrar = [...pedidos.keys()].filter((id) => !atuais.some((a) => a.grupoId === id));
  if (sair.length > 0) {
    await tx
      .update(criadores_grupos_membros)
      .set(marcaDeExclusao(p.autorId))
      .where(inArray(criadores_grupos_membros.id, sair.map((s) => s.id)));
  }
  if (entrar.length > 0) {
    await tx
      .insert(criadores_grupos_membros)
      .values(entrar.map((grupoId) => ({ criador_id: p.criadorId, grupo_id: grupoId, membro_id: p.membroId, modified_by: p.autorId })));
  }
  return { antes: atuais.map((a) => a.nome).sort(), depois: [...pedidos.values()].sort() };
}

/** Retira o membro de todos os grupos (soft delete), ao remover o vinculo. */
export async function retirarDeTodosOsGrupos(tx: Transacao, criadorId: string, membroId: string, autorId: string) {
  await tx
    .update(criadores_grupos_membros)
    .set(marcaDeExclusao(autorId))
    .where(
      and(
        eq(criadores_grupos_membros.criador_id, criadorId),
        eq(criadores_grupos_membros.membro_id, membroId),
        vivos(criadores_grupos_membros),
      ),
    );
}
