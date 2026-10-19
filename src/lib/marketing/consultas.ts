import "server-only";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  criadores_automacoes as auto,
  criadores_automacoes_execucoes as exec,
  criadores_campanhas as camp,
  criadores_emails_envios as envios,
  criadores_emails_modelos as mod,
  criadores_funis,
  criadores_leads as leads,
  criadores_membros as m,
  criadores_paginas,
  criadores_tags,
  produtos,
  usuarios as u,
} from "@/lib/db/schema";
import type { SituacaoCampanha, SituacaoEnvio } from "@/lib/db/schema/_enums";
import { vivos } from "@/lib/db/soft-delete";
import { taxa } from "./regras";

/**
 * LEITURAS das telas de Campanhas e Automações (DONO e ADMIN; `criadorId` SEMPRE do host). Métricas
 * calculadas dos envios: `aberturas`/`cliques` = PESSOAS que abriram/clicaram (únicas); as taxas são
 * sobre os enviados. Abertura por pixel é estimativa (cliente que bloqueia imagem não conta; clique
 * conta como abertura). Destinatário = membro OU lead (ADR-0023): `tipo` diz qual, nome/e-mail de quem for.
 */

/** Colunas do destinatário (membro ou lead) de um envio/execução com `lead_id`. */
const destinatario = (leadId: typeof envios.lead_id | typeof exec.lead_id) => ({
  tipo: sql<"MEMBRO" | "LEAD">`case when ${leadId} is not null then 'LEAD' else 'MEMBRO' end`,
  membroId: m.id,
  leadId: leads.id,
  nome: sql<string>`coalesce(${u.nome}, ${leads.nome})`,
  email: sql<string>`coalesce(${u.email}, ${leads.email})`,
});

const metricas = (filtro: SQL) => ({
  total: sql<number>`count(${envios.id}) filter (where ${filtro})::int`,
  enviados: sql<number>`count(*) filter (where ${filtro} and ${envios.situacao} = 'ENVIADO')::int`,
  falhas: sql<number>`count(*) filter (where ${filtro} and ${envios.situacao} = 'FALHOU')::int`,
  ignorados: sql<number>`count(*) filter (where ${filtro} and ${envios.situacao} = 'IGNORADO')::int`,
  pendentes: sql<number>`count(*) filter (where ${filtro} and ${envios.situacao} = 'PENDENTE')::int`,
  aberturas: sql<number>`count(*) filter (where ${filtro} and ${envios.aberto_em} is not null)::int`,
  cliques: sql<number>`count(*) filter (where ${filtro} and ${envios.clicado_em} is not null)::int`,
});

const comTaxas = <T extends { enviados: number; aberturas: number; cliques: number }>(x: T) => ({ ...x, taxaAbertura: taxa(x.aberturas, x.enviados), taxaClique: taxa(x.cliques, x.enviados) });

export async function listarCampanhas(criadorId: string, f: { situacao?: SituacaoCampanha } = {}) {
  const linhas = await db
    .select({
      id: camp.id,
      nome: camp.nome,
      assunto: sql<string>`${camp.conteudo}->>'assunto'`,
      situacao: camp.situacao,
      agendadaPara: camp.agendada_para,
      iniciadaEm: camp.iniciada_em,
      concluidaEm: camp.concluida_em,
      canceladaEm: camp.cancelada_em,
      destinatarios: camp.total_destinatarios,
      criadoEm: camp.created_at,
      versao: camp.updated_at,
      ...metricas(sql`${envios.id} is not null`),
    })
    .from(camp)
    .leftJoin(envios, and(eq(envios.campanha_id, camp.id), eq(envios.criador_id, criadorId)))
    .where(and(eq(camp.criador_id, criadorId), vivos(camp), f.situacao ? eq(camp.situacao, f.situacao) : undefined))
    .groupBy(camp.id)
    .orderBy(desc(camp.created_at), desc(camp.id));
  return linhas.map(comTaxas);
}

/** Editor/detalhe: conteúdo e público completos + métricas. `null` = não é deste criador. */
export async function campanhaDoCriador(criadorId: string, campanhaId: string) {
  const [c] = await db
    .select({
      id: camp.id,
      nome: camp.nome,
      conteudo: camp.conteudo,
      publico: camp.publico,
      situacao: camp.situacao,
      agendadaPara: camp.agendada_para,
      iniciadaEm: camp.iniciada_em,
      concluidaEm: camp.concluida_em,
      canceladaEm: camp.cancelada_em,
      destinatarios: camp.total_destinatarios,
      criadoEm: camp.created_at,
      versao: camp.updated_at,
      ...metricas(sql`${envios.id} is not null`),
    })
    .from(camp)
    .leftJoin(envios, and(eq(envios.campanha_id, camp.id), eq(envios.criador_id, criadorId)))
    .where(and(eq(camp.id, campanhaId), eq(camp.criador_id, criadorId), vivos(camp)))
    .groupBy(camp.id);
  return c ? comTaxas(c) : null;
}

/** Aba "Destinatários": um por pessoa, com situação, motivo e métricas. `null` = não é deste criador. */
export async function destinatariosDaCampanha(criadorId: string, campanhaId: string, f: { situacao?: SituacaoEnvio; pagina: number; porPagina: number }) {
  const [c] = await db.select({ id: camp.id }).from(camp).where(and(eq(camp.id, campanhaId), eq(camp.criador_id, criadorId), vivos(camp)));
  if (!c) return null;
  const linhas = await db
    .select({
      envioId: envios.id,
      ...destinatario(envios.lead_id),
      situacao: envios.situacao,
      motivo: envios.motivo,
      enviadoEm: envios.enviado_em,
      abertoEm: envios.aberto_em,
      aberturas: envios.aberturas,
      clicadoEm: envios.clicado_em,
      cliques: envios.cliques,
      total: sql<number>`count(*) over ()::int`,
    })
    .from(envios)
    .leftJoin(m, eq(m.id, envios.membro_id))
    .leftJoin(u, eq(u.id, m.usuario_id))
    .leftJoin(leads, eq(leads.id, envios.lead_id))
    .where(and(eq(envios.campanha_id, campanhaId), eq(envios.criador_id, criadorId), f.situacao ? eq(envios.situacao, f.situacao) : undefined))
    .orderBy(asc(sql`lower(coalesce(${u.nome}, ${leads.nome}))`), asc(envios.id))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina);
  return { total: linhas[0]?.total ?? 0, linhas }; // `total` (janela) também em cada linha: inofensivo
}

export async function listarModelos(criadorId: string) {
  return db
    .select({ id: mod.id, nome: mod.nome, conteudo: mod.conteudo, criadoEm: mod.created_at, versao: mod.updated_at })
    .from(mod)
    .where(and(eq(mod.criador_id, criadorId), vivos(mod)))
    .orderBy(asc(sql`lower(${mod.nome})`));
}

/** Lista das automações com o volume: execuções e as métricas dos e-mails que elas mandaram. */
export async function listarAutomacoes(criadorId: string) {
  const linhas = await db
    .select({
      id: auto.id,
      nome: auto.nome,
      gatilho: auto.gatilho,
      produtoId: auto.produto_id,
      produto: produtos.titulo,
      dias: auto.dias,
      atrasoMinutos: auto.atraso_minutos,
      conteudo: auto.conteudo,
      tagId: auto.tag_id,
      tag: criadores_tags.nome,
      paginaId: auto.pagina_id,
      pagina: criadores_paginas.titulo,
      funilId: auto.funil_id,
      funil: criadores_funis.nome,
      situacao: auto.situacao,
      criadoEm: auto.created_at,
      versao: auto.updated_at,
      execucoes: sql<number>`(select count(*)::int from criadores_automacoes_execucoes x where x.automacao_id = ${auto.id} and x.situacao = 'CONCLUIDA')`,
      agendadas: sql<number>`(select count(*)::int from criadores_automacoes_execucoes x where x.automacao_id = ${auto.id} and x.situacao = 'AGENDADA')`,
      ...metricas(sql`${envios.id} is not null`),
    })
    .from(auto)
    .leftJoin(produtos, eq(produtos.id, auto.produto_id))
    .leftJoin(criadores_tags, eq(criadores_tags.id, auto.tag_id))
    .leftJoin(criadores_paginas, eq(criadores_paginas.id, auto.pagina_id))
    .leftJoin(criadores_funis, eq(criadores_funis.id, auto.funil_id))
    .leftJoin(envios, and(eq(envios.automacao_id, auto.id), eq(envios.criador_id, criadorId)))
    .where(and(eq(auto.criador_id, criadorId), vivos(auto)))
    .groupBy(auto.id, produtos.titulo, criadores_tags.nome, criadores_paginas.titulo, criadores_funis.nome)
    .orderBy(desc(auto.created_at), desc(auto.id));
  return linhas.map(comTaxas);
}

/** Aba "Histórico" da automação: execuções mais recentes primeiro, com o envio. `null` = não é deste criador. */
export async function historicoDaAutomacao(criadorId: string, automacaoId: string, f: { pagina: number; porPagina: number }) {
  const [a] = await db.select({ id: auto.id }).from(auto).where(and(eq(auto.id, automacaoId), eq(auto.criador_id, criadorId)));
  if (!a) return null;
  const linhas = await db
    .select({
      id: exec.id,
      ...destinatario(exec.lead_id),
      referencia: exec.referencia,
      situacao: exec.situacao,
      motivo: exec.motivo,
      executarEm: exec.executar_em,
      executadaEm: exec.executada_em,
      tagAplicada: exec.tag_aplicada,
      envioSituacao: envios.situacao,
      envioMotivo: envios.motivo,
      abertoEm: envios.aberto_em,
      clicadoEm: envios.clicado_em,
      criadoEm: exec.created_at,
      total: sql<number>`count(*) over ()::int`,
    })
    .from(exec)
    .leftJoin(m, eq(m.id, exec.membro_id))
    .leftJoin(u, eq(u.id, m.usuario_id))
    .leftJoin(leads, eq(leads.id, exec.lead_id))
    .leftJoin(envios, eq(envios.id, exec.envio_id))
    .where(and(eq(exec.automacao_id, automacaoId), eq(exec.criador_id, criadorId)))
    .orderBy(desc(exec.created_at), desc(exec.id))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina);
  return { total: linhas[0]?.total ?? 0, linhas }; // `total` (janela) também em cada linha: inofensivo
}
