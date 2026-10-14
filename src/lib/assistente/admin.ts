import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  criadores_assistentes_conversas as conversas,
  criadores_assistentes_conversas_mensagens as mensagens,
  criadores_membros as membros,
  produtos_modulos_aulas as aulas,
  usuarios,
} from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { custoUsd } from "./regras";

/**
 * Leituras da tela do assistente (equipe, ADR-0014 RN-196/197). Perguntas recentes: só conversas
 * de ALUNOS e da equipe fora do playground (`teste = false`), não apagadas. Consumo: TODAS as
 * respostas do criador (inclusive teste e apagadas — o custo aconteceu).
 */

export interface PerguntaRecente {
  id: string;
  quando: Date;
  aluno: string;
  aula: string | null;
  pergunta: string;
  resposta: string;
  semResposta: boolean;
  interrompida: boolean;
  fontes: number;
}

export async function perguntasRecentes(criadorId: string, filtro: { semResposta: boolean }, limite = 50): Promise<PerguntaRecente[]> {
  const pergunta = sql<string>`(select u.texto from criadores_assistentes_conversas_mensagens u
    where u.conversa_id = ${mensagens.conversa_id} and u.papel = 'USUARIO' and u.created_at <= ${mensagens.created_at}
    order by u.created_at desc limit 1)`;
  const l = await db
    .select({
      id: mensagens.id,
      quando: mensagens.created_at,
      aluno: usuarios.nome,
      aula: aulas.titulo,
      pergunta,
      resposta: mensagens.texto,
      semResposta: mensagens.sem_resposta,
      interrompida: mensagens.interrompida,
      fontes: sql<number>`jsonb_array_length(${mensagens.fontes})::int`,
    })
    .from(mensagens)
    .innerJoin(conversas, and(eq(conversas.id, mensagens.conversa_id), eq(conversas.criador_id, criadorId), eq(conversas.teste, false), vivos(conversas)))
    .innerJoin(membros, eq(membros.id, mensagens.membro_id))
    .innerJoin(usuarios, eq(usuarios.id, membros.usuario_id))
    .leftJoin(aulas, and(eq(aulas.id, conversas.aula_id), vivos(aulas)))
    .where(and(eq(mensagens.criador_id, criadorId), eq(mensagens.papel, "ASSISTENTE"), vivos(mensagens), filtro.semResposta ? eq(mensagens.sem_resposta, true) : undefined))
    .orderBy(desc(mensagens.created_at))
    .limit(limite);
  return l.map((m) => ({ ...m, pergunta: m.pergunta ?? "" }));
}

export interface LinhaConsumo {
  /** AAAA-MM-DD (dia) ou AAAA-MM (mês), em Brasília. */
  periodo: string;
  perguntas: number;
  semResposta: number;
  tokensEntrada: number;
  tokensSaida: number;
  custoUsd: number;
}

/** Consumo por dia (últimos `dias`) e por mês (últimos 6), com custo ESTIMADO pela tabela de preços. */
export async function consumoDoAssistente(criadorId: string, agora: Date = new Date(), dias = 30): Promise<{ dias: LinhaConsumo[]; meses: LinhaConsumo[] }> {
  const desde = new Date(agora.getTime() - 186 * 86_400_000);
  const brt = sql`(${mensagens.created_at} at time zone 'America/Sao_Paulo')`;
  const l = await db
    .select({
      dia: sql<string>`to_char(${brt}::date, 'YYYY-MM-DD')`,
      modelo: mensagens.modelo,
      perguntas: sql<number>`count(*)::int`,
      semResposta: sql<number>`count(*) filter (where ${mensagens.sem_resposta})::int`,
      entrada: sql<number>`sum(${mensagens.tokens_entrada})::int`,
      saida: sql<number>`sum(${mensagens.tokens_saida})::int`,
      cacheLeitura: sql<number>`sum(${mensagens.tokens_cache_leitura})::int`,
      cacheEscrita: sql<number>`sum(${mensagens.tokens_cache_escrita})::int`,
    })
    // Sem vivos(): conversa apagada pelo aluno também custou.
    .from(mensagens)
    .where(and(eq(mensagens.criador_id, criadorId), eq(mensagens.papel, "ASSISTENTE"), gte(mensagens.created_at, desde), sql`${mensagens.is_deleted} in (true, false)`))
    .groupBy(sql`1`, mensagens.modelo);

  const somar = (mapa: Map<string, LinhaConsumo>, chave: string, x: (typeof l)[number]) => {
    const atual = mapa.get(chave) ?? { periodo: chave, perguntas: 0, semResposta: 0, tokensEntrada: 0, tokensSaida: 0, custoUsd: 0 };
    atual.perguntas += x.perguntas;
    atual.semResposta += x.semResposta;
    atual.tokensEntrada += x.entrada + x.cacheLeitura + x.cacheEscrita;
    atual.tokensSaida += x.saida;
    atual.custoUsd += custoUsd({ entrada: x.entrada, saida: x.saida, cacheLeitura: x.cacheLeitura, cacheEscrita: x.cacheEscrita }, x.modelo);
    mapa.set(chave, atual);
  };
  const porDia = new Map<string, LinhaConsumo>();
  const porMes = new Map<string, LinhaConsumo>();
  const limiteDia = new Date(agora.getTime() - dias * 86_400_000).toISOString().slice(0, 10);
  for (const x of l) {
    if (x.dia > limiteDia) somar(porDia, x.dia, x);
    somar(porMes, x.dia.slice(0, 7), x);
  }
  const ordenar = (m: Map<string, LinhaConsumo>) => [...m.values()].sort((a, b) => b.periodo.localeCompare(a.periodo));
  return { dias: ordenar(porDia), meses: ordenar(porMes).slice(0, 6) };
}
