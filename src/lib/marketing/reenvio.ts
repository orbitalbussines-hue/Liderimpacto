import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { motivoParaNaoGerarLink, type AlvoDoLink, type AtorDoLink } from "@/lib/auth/link-de-senha-regra";
import { db } from "@/lib/db";
import { criadores_emails_envios as envios, criadores_membros, usuarios } from "@/lib/db/schema";
import type { PapelCriador } from "@/lib/db/schema/_enums";
import type { PublicoCampanha } from "@/lib/db/schema/marketing";
import { vivos } from "@/lib/db/soft-delete";
import { pessoasDoPublico, conferirPublico } from "./publico";

/**
 * REENVIO DO PRIMEIRO ACESSO EM MASSA (RN-226): para um público (ex.: grupo + "nunca acessou"), cada
 * pessoa recebe um link NOVO de definir senha por e-mail, pela fila `emails` com teto. Quem pode
 * receber é a regra EXISTENTE (`motivoParaNaoGerarLink`, RN-102): só membro DESTA área, papel abaixo
 * do de quem pede, sem vínculo em outra área e não SUPER_ADMIN. O link nasce NO WORKER, na hora do
 * envio (`gerarLinkDeSenha`: invalida os anteriores e grava a trilha antes) — assim o teto que adia o
 * envio não come a validade de 24 h. A regra é conferida de novo no envio (o vínculo pode mudar).
 */

/** Conta de quem pede, lida do banco (o papel vale agora, não quando o lote foi criado). */
export async function atorDoLink(usuarioId: string, criadorId: string): Promise<AtorDoLink> {
  const [u] = await db.select({ papel: usuarios.papel_plataforma, ativo: usuarios.ativo }).from(usuarios).where(and(eq(usuarios.id, usuarioId), vivos(usuarios)));
  const [m] = await db
    .select({ papel: criadores_membros.papel })
    .from(criadores_membros)
    .where(and(eq(criadores_membros.usuario_id, usuarioId), eq(criadores_membros.criador_id, criadorId), eq(criadores_membros.status, "ATIVO"), vivos(criadores_membros)));
  const superAdmin = !!u?.ativo && u.papel === "SUPER_ADMIN";
  return { id: usuarioId, superAdmin, criadorId, papel: superAdmin ? "DONO" : u?.ativo ? (m?.papel ?? null) : null };
}

/** Alvo da regra (papel na plataforma + vínculos vivos) de cada conta. */
export async function alvosDoLink(usuarioIds: readonly string[]): Promise<Map<string, AlvoDoLink>> {
  const mapa = new Map<string, AlvoDoLink>();
  if (!usuarioIds.length) return mapa;
  const linhas = await db
    .select({ id: usuarios.id, papel: usuarios.papel_plataforma, criadorId: criadores_membros.criador_id, papelNoCriador: criadores_membros.papel })
    .from(usuarios)
    .leftJoin(criadores_membros, and(eq(criadores_membros.usuario_id, usuarios.id), vivos(criadores_membros)))
    .where(inArray(usuarios.id, [...usuarioIds]));
  for (const l of linhas) {
    const a = mapa.get(l.id) ?? { id: l.id, papelPlataforma: l.papel, vinculos: [] };
    if (l.criadorId && l.papelNoCriador) a.vinculos.push({ criadorId: l.criadorId, papel: l.papelNoCriador as PapelCriador });
    mapa.set(l.id, a);
  }
  return mapa;
}

async function elegiveis(criadorId: string, ator: AtorDoLink, publico: PublicoCampanha) {
  await conferirPublico(db, criadorId, publico);
  const pessoas = await pessoasDoPublico(criadorId, publico);
  const alvos = await alvosDoLink(pessoas.map((p) => p.usuarioId));
  const ok = pessoas.filter((p) => {
    const alvo = alvos.get(p.usuarioId);
    return alvo && motivoParaNaoGerarLink(ator, alvo) === null;
  });
  return { total: pessoas.length, ok };
}

/** Contagem antes de enviar: quantos estão no filtro e quantos receberão (o resto a regra não deixa). */
export async function contarReenvio(criadorId: string, ator: AtorDoLink, publico: PublicoCampanha) {
  const { total, ok } = await elegiveis(criadorId, ator, publico);
  return { total, receberao: ok.length, foraDaRegra: total - ok.length };
}

export const LIMITE_REENVIO = 5000;

/** Cria o LOTE (um envio PENDENTE por pessoa) com a trilha; quem chama enfileira depois do commit. */
export async function criarLoteDeReenvio(p: { criadorId: string; ator: AtorDoLink; publico: PublicoCampanha }) {
  const { total, ok } = await elegiveis(p.criadorId, p.ator, p.publico);
  const pessoas = ok.slice(0, LIMITE_REENVIO);
  const lote = randomUUID();
  const ids = await db.transaction(async (tx) => {
    const criados = pessoas.length
      ? await tx
          .insert(envios)
          .values(pessoas.map((x) => ({ criador_id: p.criadorId, membro_id: x.membroId, origem: "PRIMEIRO_ACESSO" as const, chave: `primeiro-acesso:${lote}:${x.membroId}`, modified_by: p.ator.id })))
          .onConflictDoNothing()
          .returning({ id: envios.id })
      : [];
    await registrarAuditoria(tx, {
      userId: p.ator.id,
      criadorId: p.criadorId,
      acao: "criar",
      tabela: "criadores_emails_envios",
      registroId: lote,
      detalhes: `Reenvio do primeiro acesso em massa: ${criados.length} pessoa(s) na fila (${total - ok.length} fora da regra de link)`,
      dadosNovos: { lote, publico: p.publico, enfileirados: criados.length },
    });
    return criados.map((c) => c.id);
  });
  return { lote, envioIds: ids, total, foraDaRegra: total - ok.length, alemDoLimite: Math.max(0, ok.length - LIMITE_REENVIO) };
}
