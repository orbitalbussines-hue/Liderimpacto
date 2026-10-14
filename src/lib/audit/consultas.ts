import "server-only";
import { and, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditoria, usuarios } from "@/lib/db/schema";
import type { AcaoAuditada } from "./registrar";
import { codificarCursor, detalheSeguro, rotuloEntidade, tituloDoDetalhe, type CursorTrilha } from "./regras";

/**
 * Leitura da trilha de auditoria do criador do HOST (Configurações > Logs, só DONO). SÓ leitura:
 * a trilha é append-only. Tudo filtra `criador_id` (evento de outra área ou da plataforma nunca
 * aparece) e sai pelo `detalheSeguro` — `dados_anteriores`/`dados_novos` nunca são selecionados.
 * Sem filtro de is_deleted de propósito: a `auditoria` não tem soft delete (append-only) e o nome
 * de quem fez continua na trilha mesmo que a conta tenha sido excluída depois.
 */

export interface FiltrosTrilha {
  /** Parte do NOME de quem fez (nunca e-mail). */
  pessoa?: string;
  acao?: AcaoAuditada;
  tabela?: string;
  /** Dias de Brasília `de..ate` (inclusivos, já validados por `lerIntervaloExplicito`). Ausente = desde o início. */
  periodo?: { de: string; ate: string };
  /** Aba "Excluídos": só `acao = excluir`. */
  somenteExclusoes?: boolean;
  cursor?: CursorTrilha | null;
  limite: number;
}

export interface EventoDaTrilha {
  id: string;
  quando: Date;
  /** Nome de quem fez; nulo = evento anônimo (tentativa de entrada sem conta). */
  pessoa: string | null;
  acao: string;
  tabela: string;
  entidade: string;
  registroId: string | null;
  /** Já mascarado (`detalheSeguro`). */
  detalhes: string;
  /** Título/nome entre aspas do detalhe ("o que era", na aba Excluídos). */
  titulo: string | null;
}

const curinga = (texto: string) => `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Página da trilha, da mais nova para a mais antiga, com cursor (keyset) para a próxima. */
export async function listarTrilha(criadorId: string, f: FiltrosTrilha): Promise<{ linhas: EventoDaTrilha[]; proximo: string | null }> {
  const condicoes: SQL[] = [eq(auditoria.criador_id, criadorId)];
  if (f.somenteExclusoes) condicoes.push(eq(auditoria.acao, "excluir"));
  else if (f.acao) condicoes.push(eq(auditoria.acao, f.acao));
  if (f.tabela) condicoes.push(eq(auditoria.tabela, f.tabela));
  if (f.periodo) {
    // Meia-noite de Brasília convertida (usa o índice de created_at); o fim é o dia SEGUINTE a `ate`, exclusivo.
    condicoes.push(sql`${auditoria.created_at} >= (${f.periodo.de}::date::timestamp at time zone 'America/Sao_Paulo')`);
    condicoes.push(sql`${auditoria.created_at} < ((${f.periodo.ate}::date + 1)::timestamp at time zone 'America/Sao_Paulo')`);
  }
  if (f.pessoa) condicoes.push(ilike(usuarios.nome, curinga(f.pessoa)));
  if (f.cursor) condicoes.push(sql`(${auditoria.created_at}, ${auditoria.id}) < (${f.cursor.em.toISOString()}::timestamptz, ${f.cursor.id}::uuid)`);

  const brutas = await db
    .select({
      id: auditoria.id,
      quando: auditoria.created_at,
      pessoa: usuarios.nome,
      acao: auditoria.acao,
      tabela: auditoria.tabela,
      registroId: auditoria.registro_id,
      detalhes: auditoria.detalhes,
    })
    .from(auditoria)
    .leftJoin(usuarios, eq(usuarios.id, auditoria.user_id))
    .where(and(...condicoes))
    .orderBy(desc(auditoria.created_at), desc(auditoria.id))
    .limit(f.limite + 1);

  const temMais = brutas.length > f.limite;
  const linhas = brutas.slice(0, f.limite).map((l) => {
    const detalhes = detalheSeguro(l.detalhes);
    return { ...l, entidade: rotuloEntidade(l.tabela), detalhes, titulo: tituloDoDetalhe(detalhes) };
  });
  const ultima = linhas.at(-1);
  return { linhas, proximo: temMais && ultima ? codificarCursor({ em: ultima.quando, id: ultima.id }) : null };
}

/** Entidades (tabelas) que já aparecem na trilha do criador: opções do filtro. */
export async function entidadesDaTrilha(criadorId: string): Promise<{ tabela: string; rotulo: string }[]> {
  const linhas = await db.selectDistinct({ tabela: auditoria.tabela }).from(auditoria).where(eq(auditoria.criador_id, criadorId));
  return linhas.map((l) => ({ tabela: l.tabela, rotulo: rotuloEntidade(l.tabela) })).sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}
