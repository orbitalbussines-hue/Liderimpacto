import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  criadores_integracoes as integ,
  criadores_integracoes_eventos as ev,
  criadores_integracoes_oauth as oauth,
  criadores_integracoes_pedidos as pedidos,
  criadores_integracoes_pedidos_resgates as resgates,
  criadores_integracoes_produtos as mapa,
  criadores_membros,
  integracoes_recibos as recibos,
  produtos,
  usuarios,
} from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { mascararEmail } from "@/lib/email/disparos";
import type { SituacaoNaTela } from "./regras";

/** Leituras das telas de Integrações (só DONO, criador do HOST). Nunca devolvem o segredo, a cifra, os tokens nem o CPF. */

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

/** Autorização do Bling da área (sem tokens): client_id só os 4 finais. */
export async function autorizacaoBling(criadorId: string) {
  const [o] = await db
    .select({ integracaoId: oauth.integracao_id, clienteId: oauth.cliente_id, situacao: oauth.situacao, renovadoEm: oauth.renovado_em, erro: oauth.erro })
    .from(oauth)
    .where(and(eq(oauth.criador_id, criadorId), vivos(oauth)));
  return o ? { integracaoId: o.integracaoId, clienteIdFinal: o.clienteId.slice(-4), situacao: o.situacao, renovadoEm: o.renovadoEm, erro: o.erro } : null;
}

/** Pedidos de marketplace (Bling) mais recentes: sem CPF; quem resgatou só com o e-mail mascarado. */
export async function pedidosMarketplace(criadorId: string, limite = 50) {
  const linhas = await db
    .select({
      id: pedidos.id,
      pedidoId: pedidos.pedido_id,
      numeroLoja: pedidos.numero_loja,
      lojaId: pedidos.loja_id,
      skus: pedidos.skus,
      situacao: pedidos.situacao,
      comCpf: sql<boolean>`${pedidos.cpf_hmac} is not null`,
      atualizadoEm: pedidos.updated_at,
      resgatadoEm: resgates.created_at,
      email: usuarios.email,
    })
    .from(pedidos)
    .leftJoin(resgates, eq(resgates.pedido_id, pedidos.id))
    .leftJoin(criadores_membros, eq(criadores_membros.id, resgates.membro_id))
    .leftJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .where(and(eq(pedidos.criador_id, criadorId), vivos(pedidos)))
    .orderBy(desc(pedidos.updated_at), desc(pedidos.id))
    .limit(limite);
  return linhas.map(({ email, ...l }) => ({ ...l, resgatadoPor: email ? mascararEmail(email) : null }));
}
