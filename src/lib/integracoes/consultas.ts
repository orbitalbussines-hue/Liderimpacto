import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { criadores_integracoes as integ, criadores_integracoes_eventos as ev, criadores_integracoes_produtos as mapa, criadores_membros, integracoes_recibos as recibos, produtos, usuarios } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { mascararEmail } from "@/lib/email/disparos";
import type { SituacaoNaTela } from "./regras";

/** Leituras das telas de Integrações (só DONO, criador do HOST). Nunca devolvem o segredo nem a cifra. */

export async function integracoesDoCriador(criadorId: string) {
  return db
    .select({ id: integ.id, plataforma: integ.plataforma, segredoFinal: integ.segredo_final, criadoEm: integ.created_at, versao: integ.updated_at })
    .from(integ)
    .where(and(eq(integ.criador_id, criadorId), vivos(integ)))
    .orderBy(asc(integ.plataforma));
}

export async function mapeamentosDoCriador(criadorId: string) {
  return db
    .select({
      id: mapa.id,
      integracaoId: mapa.integracao_id,
      plataforma: integ.plataforma,
      produtoExterno: mapa.produto_externo,
      nomeExterno: mapa.nome_externo,
      produtoId: mapa.produto_id,
      produto: produtos.titulo,
      diasAcesso: mapa.dias_acesso,
      versao: mapa.updated_at,
    })
    .from(mapa)
    .innerJoin(integ, eq(integ.id, mapa.integracao_id))
    .innerJoin(produtos, eq(produtos.id, mapa.produto_id))
    .where(and(eq(mapa.criador_id, criadorId), vivos(mapa), vivos(integ)))
    .orderBy(asc(integ.plataforma), asc(mapa.produto_externo), asc(produtos.titulo));
}

/** Últimos eventos recebidos (recibo + processamento). Pessoa: e-mail mascarado enquanto pendente; depois, o nome do aluno. */
export async function eventosRecentes(criadorId: string, limite = 50) {
  const linhas = await db
    .select({
      reciboId: recibos.id,
      eventoId: ev.id,
      plataforma: recibos.plataforma,
      evento: recibos.evento,
      tipo: recibos.tipo,
      transacao: recibos.transacao,
      assinatura: recibos.assinatura,
      produtoExterno: recibos.produto_externo,
      recusa: recibos.recusa,
      recebidoEm: recibos.created_at,
      situacao: ev.situacao,
      nota: ev.erro,
      email: ev.comprador_email,
      aluno: usuarios.nome,
      versao: ev.updated_at,
    })
    .from(recibos)
    .leftJoin(ev, eq(ev.recibo_id, recibos.id))
    .leftJoin(criadores_membros, eq(criadores_membros.id, ev.membro_id))
    .leftJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .where(eq(recibos.criador_id, criadorId))
    .orderBy(desc(recibos.created_at), desc(recibos.id))
    .limit(limite);
  return linhas.map(({ email, aluno, situacao, versao, ...l }) => ({
    ...l,
    situacao: (l.recusa ? "RECUSADO" : (situacao ?? "IGNORADO")) as SituacaoNaTela,
    pessoa: email ? mascararEmail(email) : aluno,
    versao: versao?.toISOString() ?? null,
  }));
}
