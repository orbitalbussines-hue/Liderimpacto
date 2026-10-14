import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import type { QuemPede } from "@/lib/progresso/visao";
import { fimDoEvento, momentoDoEvento, type MomentoDoEvento } from "./regras";
import { veEventoSql } from "./sql";

/**
 * LEITURAS dos eventos para a área do aluno (ADR-0011). `q` = `membroDaPagina(TODOS_OS_MEMBROS)`:
 * criador do HOST e membro da sessão. Rascunho nunca aparece aqui (nem para a equipe: o admin tem a
 * própria lista). O LINK só sai quando o momento é ABERTO e o evento está PUBLICADO (RN-142); a
 * gravação só depois do fim. Uma consulta por chamada.
 */

export interface EventoDoMembro {
  id: string;
  titulo: string;
  descricao: string;
  inicioEm: Date;
  fimEm: Date;
  duracaoMin: number;
  situacao: "PUBLICADO" | "CANCELADO";
  momento: MomentoDoEvento;
  /** Só na janela (15 min antes até o fim) e PUBLICADO; fora disso, nulo SEMPRE. */
  link: string | null;
  /** Aula da gravação, só depois do fim (o player confere o acesso à aula). */
  gravacaoAulaId: string | null;
  inscrito: boolean;
  inscritos: number;
}

interface Linha extends Record<string, unknown> {
  id: string;
  titulo: string;
  descricao: string;
  inicio_em: string | Date;
  duracao_min: number;
  situacao: "PUBLICADO" | "CANCELADO";
  link_acesso: string | null;
  gravacao_aula_id: string | null;
  inscrito: boolean;
  inscritos: number;
}

function paraEvento(l: Linha, agora: Date): EventoDoMembro {
  const agenda = { inicioEm: new Date(l.inicio_em), duracaoMin: l.duracao_min };
  const momento = momentoDoEvento(agenda, agora);
  return {
    id: l.id,
    titulo: l.titulo,
    descricao: l.descricao,
    inicioEm: agenda.inicioEm,
    fimEm: fimDoEvento(agenda),
    duracaoMin: l.duracao_min,
    situacao: l.situacao,
    momento,
    link: l.situacao === "PUBLICADO" && momento === "ABERTO" ? l.link_acesso : null,
    gravacaoAulaId: momento === "ENCERRADO" ? l.gravacao_aula_id : null,
    inscrito: l.inscrito,
    inscritos: l.inscritos,
  };
}

const membroSql = (q: QuemPede) => (q.membro.id ? sql`${q.membro.id}::uuid` : sql`null::uuid`);

async function buscar(q: QuemPede, agora: Date, filtro: SQL, ordem: SQL, limite: number): Promise<EventoDoMembro[]> {
  const m = membroSql(q);
  const { rows } = await db.execute<Linha>(sql`
    select e.id, e.titulo, e.descricao, e.inicio_em, e.duracao_min, e.situacao, e.link_acesso, e.gravacao_aula_id,
      exists (select 1 from criadores_eventos_inscricoes i where i.evento_id = e.id and i.membro_id = ${m} and i.is_deleted = false) as inscrito,
      (select count(*) from criadores_eventos_inscricoes i where i.evento_id = e.id and i.is_deleted = false)::int as inscritos
    from criadores_eventos e
    where e.criador_id = ${q.criador.id}::uuid and e.is_deleted = false and e.situacao <> 'RASCUNHO'
      and ${veEventoSql(m, sql`${q.membro.papel}`, agora)} and ${filtro}
    order by ${ordem}
    limit ${limite}
  `);
  return rows.map((l) => paraEvento(l, agora));
}

const FIM = sql`(e.inicio_em + make_interval(mins => e.duracao_min))`;

/** Próximos (ainda não terminaram), do mais cedo ao mais tarde, cancelados inclusive (a tela marca). */
export const eventosProximos = (q: QuemPede, agora: Date, limite = 50) => buscar(q, agora, sql`${FIM} > ${agora}`, sql`e.inicio_em, e.id`, limite);

/** Já terminaram, do mais recente ao mais antigo (com a gravação, se houver). */
export const eventosPassados = (q: QuemPede, agora: Date, limite = 50) => buscar(q, agora, sql`${FIM} <= ${agora}`, sql`e.inicio_em desc, e.id`, limite);

/** Um evento que quem pede vê (nulo = não existe, de outro criador, rascunho ou fora do público). */
export async function eventoDoMembro(q: QuemPede, eventoId: string, agora: Date): Promise<EventoDoMembro | null> {
  return (await buscar(q, agora, sql`e.id = ${eventoId}::uuid`, sql`e.id`, 1))[0] ?? null;
}

/** "Próximo encontro ao vivo" (lateral da comunidade, vitrine): o primeiro PUBLICADO que não terminou. */
export async function proximoEventoDoMembro(q: QuemPede, agora: Date): Promise<EventoDoMembro | null> {
  return (await buscar(q, agora, sql`e.situacao = 'PUBLICADO' and ${FIM} > ${agora}`, sql`e.inicio_em, e.id`, 1))[0] ?? null;
}
