import "server-only";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { veCanalSql } from "@/lib/comunidade/sql";
import { db } from "@/lib/db";
import type { TipoNotificacao } from "@/lib/db/schema/_enums";
import type { DadosNotificacao } from "@/lib/db/schema/comunidade-moderacao";
import { criadores_membros_notificacoes as notificacoes } from "@/lib/db/schema";
import { chaveDoLembrete } from "@/lib/eventos/regras";
import { veEventoSql } from "@/lib/eventos/sql";
import { dataEmBrasilia } from "@/lib/matriculas/regras";
import { RETENCAO_DIAS } from "./regras";

/**
 * GERAÇÃO das notificações (RN-134). Regras que valem para TODAS as funções daqui:
 *  - chamadas DEPOIS do commit da ação principal (fora da transação dela);
 *  - NUNCA lançam: falha vira log e a ação principal segue valendo;
 *  - nunca notificam quem causou o evento (`autorUsuarioId`);
 *  - `chave` torna a geração idempotente (evento repetido não duplica) e agrega as curtidas.
 * ponytail: envio em massa (aviso, fixado, aula nova) é um INSERT ... SELECT na própria requisição;
 * vira job da fila quando um criador passar de ~10 mil membros.
 */

async function seguro(rotulo: string, f: () => Promise<unknown>): Promise<void> {
  try {
    await f();
  } catch (e) {
    console.error(`[notificacoes] falha ao gerar ${rotulo} (a ação principal já valeu):`, e);
  }
}

const json = (d: DadosNotificacao) => sql`${JSON.stringify(d)}::jsonb`;

/**
 * INSERT ... SELECT a partir de `criadores_membros m` (destinatários = `onde`, sempre vínculo ATIVO
 * e vivo no criador; quem causou fica de fora). `dados`/`chave` podem usar colunas de m.
 * `autorId` nulo = evento do sistema: `modified_by` = a própria pessoa notificada.
 */
async function enviar(p: { criadorId: string; tipo: TipoNotificacao; dados: SQL; chave: SQL; autorId: string | null; excluirUsuarioId: string | null; onde: SQL; de?: SQL }): Promise<number> {
  const r = await db.execute(sql`
    insert into criadores_membros_notificacoes (criador_id, membro_id, tipo, dados, chave, modified_by)
    select m.criador_id, m.id, ${p.tipo}, ${p.dados}, ${p.chave}, ${p.autorId ? sql`${p.autorId}::uuid` : sql`m.usuario_id`}
    from criadores_membros m ${p.de ?? sql``}
    where m.criador_id = ${p.criadorId} and m.status = 'ATIVO' and m.is_deleted = false
      ${p.excluirUsuarioId ? sql`and m.usuario_id <> ${p.excluirUsuarioId}::uuid` : sql``}
      and ${p.onde}
    on conflict (membro_id, chave) where chave is not null do nothing`);
  return r.rowCount ?? 0;
}

export interface Ator {
  usuarioId: string;
  /** Nulo = SUPER_ADMIN sem vínculo (moderação). */
  membroId: string | null;
  /** Primeiro nome (nada além disso vai para a notificação). */
  nome: string;
}

/** Comentário novo: resposta -> autor do comentário pai; em post -> autor do post (sem duplicar). */
export async function notificarComentario(criadorId: string, comentarioId: string, ator: Ator): Promise<void> {
  await seguro("comentário", async () => {
    const r = await db.execute<{ post_id: string | null; aula_id: string | null; pai_autor: string | null; post_autor: string | null }>(sql`
      select c.post_id, c.aula_id, pai.autor_membro_id as pai_autor, p.autor_membro_id as post_autor
      from criadores_comentarios c
      left join criadores_comentarios pai on pai.id = c.pai_id and pai.is_deleted = false
      left join criadores_canais_posts p on p.id = c.post_id and p.is_deleted = false
      where c.id = ${comentarioId} and c.criador_id = ${criadorId} and c.is_deleted = false`);
    const c = r.rows[0];
    if (!c) return;
    const base: DadosNotificacao = { atorNome: ator.nome, comentarioId, ...(c.post_id ? { postId: c.post_id } : {}), ...(c.aula_id ? { aulaId: c.aula_id } : {}) };
    const comum = { criadorId, dados: json(base), autorId: ator.usuarioId, excluirUsuarioId: ator.usuarioId };
    if (c.pai_autor) await enviar({ ...comum, tipo: "RESPOSTA_AO_COMENTARIO", chave: sql`${`resposta:${comentarioId}`}`, onde: sql`m.id = ${c.pai_autor}::uuid` });
    if (c.post_autor && c.post_autor !== c.pai_autor) {
      await enviar({ ...comum, tipo: "COMENTARIO_NO_POST", chave: sql`${`comentario:${comentarioId}`}`, onde: sql`m.id = ${c.post_autor}::uuid` });
    }
  });
}

/**
 * Curtida nova no post: UMA notificação por post por dia (Brasília), agregada — `atores` guarda quem
 * curtiu sem repetir ("Ana e mais 3 curtiram"). Curtida de quem já está na lista não muda nada
 * (descurtir/curtir de novo não "sobe" a notificação). Descurtir não desconta.
 */
export async function notificarCurtidaNoPost(criadorId: string, postId: string, ator: Ator & { membroId: string }, agora = new Date()): Promise<void> {
  await seguro("curtida", async () => {
    const chave = `curtidas:${postId}:${dataEmBrasilia(agora)}`;
    const dados = json({ atorNome: ator.nome, postId });
    await db.execute(sql`
      insert into criadores_membros_notificacoes as n (criador_id, membro_id, tipo, dados, chave, atores, total, evento_em, modified_by)
      select p.criador_id, p.autor_membro_id, 'CURTIDAS_NO_POST', ${dados}, ${chave}, jsonb_build_array(${ator.membroId}::text), 1, ${agora}, ${ator.usuarioId}::uuid
      from criadores_canais_posts p
      join criadores_membros m on m.id = p.autor_membro_id and m.status = 'ATIVO' and m.is_deleted = false
      where p.id = ${postId} and p.criador_id = ${criadorId} and p.is_deleted = false and p.autor_membro_id <> ${ator.membroId}::uuid
      on conflict (membro_id, chave) where chave is not null do update set
        atores = n.atores || excluded.atores,
        total = jsonb_array_length(n.atores) + 1,
        dados = excluded.dados,
        evento_em = excluded.evento_em,
        lida_em = null,
        updated_at = excluded.evento_em,
        modified_by = excluded.modified_by
      where not (n.atores ? ${ator.membroId})`);
  });
}

/**
 * Aviso no canal de avisos (`AVISO`) ou post fixado (`POST_FIXADO`): para TODOS que veem o canal
 * (mesma regra de `veCanalSql`), menos quem publicou/fixou.
 */
export async function notificarCanal(criadorId: string, postId: string, tipo: "AVISO" | "POST_FIXADO", ator: Ator, agora = new Date()): Promise<void> {
  await seguro(tipo, async () => {
    const r = await db.execute<{ canal_nome: string }>(sql`
      select c.nome as canal_nome from criadores_canais_posts p join criadores_canais c on c.id = p.canal_id and c.is_deleted = false
      where p.id = ${postId} and p.criador_id = ${criadorId} and p.is_deleted = false and p.oculto_em is null`);
    const canal = r.rows[0];
    if (!canal) return;
    await enviar({
      criadorId,
      tipo,
      dados: json({ atorNome: ator.nome, postId, canalNome: canal.canal_nome }),
      chave: sql`${`${tipo === "AVISO" ? "aviso" : "fixado"}:${postId}`}`,
      autorId: ator.usuarioId,
      excluirUsuarioId: ator.usuarioId,
      de: sql`join criadores_canais_posts p on p.id = ${postId} join criadores_canais c on c.id = p.canal_id`,
      onde: veCanalSql({ acesso: sql`c.acesso`, grupo_id: sql`c.grupo_id`, produto_id: sql`c.produto_id` }, sql`m.id`, sql`m.papel`, agora),
    });
  });
}

/**
 * Aula nova (o vídeo da aula ficou PRONTO pela primeira vez): alunos com matrícula valendo no
 * curso, se a aula já é visível (módulo publicado, curso fora de rascunho, liberada). Idempotente
 * por aula (`aula:<id>`): trocar o vídeo depois não notifica de novo.
 */
export async function notificarAulaNova(criadorId: string, aulaId: string, autorId: string, agora = new Date()): Promise<void> {
  await seguro("aula nova", async () => {
    const r = await db.execute<{ produto_id: string; aula_titulo: string; produto_titulo: string }>(sql`
      select pr.id as produto_id, a.titulo as aula_titulo, pr.titulo as produto_titulo
      from produtos_modulos_aulas a
      join produtos_modulos mo on mo.id = a.modulo_id and mo.is_deleted = false and mo.status = 'PUBLICADO'
      join produtos pr on pr.id = mo.produto_id and pr.is_deleted = false and pr.status <> 'RASCUNHO'
      where a.id = ${aulaId} and a.criador_id = ${criadorId} and a.is_deleted = false
        and (a.libera_em is null or a.libera_em <= ${agora})`);
    const a = r.rows[0];
    if (!a) return;
    await enviar({
      criadorId,
      tipo: "AULA_NOVA",
      dados: json({ aulaId, aulaTitulo: a.aula_titulo, produtoTitulo: a.produto_titulo }),
      chave: sql`${`aula:${aulaId}`}`,
      autorId,
      excluirUsuarioId: autorId,
      onde: sql`m.papel = 'ALUNO' and exists (select 1 from produtos_matriculas pm where pm.membro_id = m.id and pm.produto_id = ${a.produto_id}::uuid
        and pm.is_deleted = false and pm.status = 'ATIVA' and (pm.expira_em is null or pm.expira_em > ${agora}))`,
    });
  });
}

/** Certificado emitido (emissão automática): para a pessoa certificada. */
export async function notificarCertificado(criadorId: string, certificadoId: string): Promise<void> {
  await seguro("certificado", async () => {
    await db.execute(sql`
      insert into criadores_membros_notificacoes (criador_id, membro_id, tipo, dados, chave, modified_by)
      select c.criador_id, c.membro_id, 'CERTIFICADO_EMITIDO',
        jsonb_build_object('certificadoId', c.id::text, 'produtoTitulo', p.titulo), ${`certificado:${certificadoId}`}, c.modified_by
      from produtos_certificados c join produtos p on p.id = c.produto_id
      where c.id = ${certificadoId} and c.criador_id = ${criadorId} and c.is_deleted = false and c.situacao = 'EMITIDO'
      on conflict (membro_id, chave) where chave is not null do nothing`);
  });
}

/**
 * Matrículas criadas ou reativadas (`matricular`/`matricularGrupo` devolvem os ids): para cada
 * pessoa matriculada, se o curso não está em rascunho. A chave leva a versão da linha: reativar
 * depois notifica de novo; repetir a mesma chamada, não.
 */
export async function notificarMatriculas(criadorId: string, matriculaIds: readonly string[], autorId: string | null): Promise<void> {
  if (matriculaIds.length === 0) return;
  await seguro("matrícula", async () => {
    const ids = sql.join(
      matriculaIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    await enviar({
      criadorId,
      tipo: "MATRICULA_NOVA",
      dados: sql`jsonb_build_object('produtoTitulo', pr.titulo, 'produtoSlug', pr.slug)`,
      chave: sql`'matricula:' || pm.id::text || ':' || (extract(epoch from pm.updated_at) * 1000)::bigint::text`,
      autorId,
      excluirUsuarioId: autorId,
      de: sql`join produtos_matriculas pm on pm.membro_id = m.id join produtos pr on pr.id = pm.produto_id`,
      onde: sql`pm.id in (${ids}) and pm.is_deleted = false and pm.status = 'ATIVA' and pr.is_deleted = false and pr.status <> 'RASCUNHO'`,
    });
  });
}

/** Denúncia nova: para a equipe (DONO e ADMIN) do criador, menos quem denunciou. */
export async function notificarDenuncia(criadorId: string, denunciaId: string, ator: Ator): Promise<void> {
  await seguro("denúncia", () =>
    enviar({
      criadorId,
      tipo: "DENUNCIA_NOVA",
      dados: json({ denunciaId }),
      chave: sql`${`denuncia:${denunciaId}`}`,
      autorId: ator.usuarioId,
      excluirUsuarioId: ator.usuarioId,
      onde: sql`m.papel in ('DONO', 'ADMIN')`,
    }),
  );
}

// ---------------------------------------------------------------- eventos ao vivo (ADR-0011, RN-143)

/** Junta o evento vivo do criador (`e`) e congela id, título e início na notificação. */
const deEvento = (eventoId: string) => sql`join criadores_eventos e on e.id = ${eventoId}::uuid and e.criador_id = m.criador_id and e.is_deleted = false`;
const DADOS_EVENTO = sql`jsonb_build_object('eventoId', e.id::text, 'eventoTitulo', e.titulo,
  'eventoInicio', to_char(e.inicio_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`;
const inscritoSql = sql`exists (select 1 from criadores_eventos_inscricoes i where i.evento_id = e.id and i.membro_id = m.id and i.is_deleted = false)`;

/** Evento PUBLICADO: para os ALUNOS do público (`veEventoSql`), uma vez por evento. */
export async function notificarEventoPublicado(criadorId: string, eventoId: string, ator: Ator, agora = new Date()): Promise<void> {
  await seguro("evento publicado", () =>
    enviar({
      criadorId,
      tipo: "EVENTO_PUBLICADO",
      dados: DADOS_EVENTO,
      chave: sql`${`evento:${eventoId}`}`,
      autorId: ator.usuarioId,
      excluirUsuarioId: ator.usuarioId,
      de: deEvento(eventoId),
      onde: sql`e.situacao = 'PUBLICADO' and m.papel = 'ALUNO' and ${veEventoSql(sql`m.id`, sql`m.papel`, agora)}`,
    }),
  );
}

/** Evento CANCELADO: para quem tinha confirmado presença. */
export async function notificarEventoCancelado(criadorId: string, eventoId: string, ator: Ator): Promise<void> {
  await seguro("evento cancelado", () =>
    enviar({
      criadorId,
      tipo: "EVENTO_CANCELADO",
      dados: DADOS_EVENTO,
      chave: sql`${`evento-cancelado:${eventoId}`}`,
      autorId: ator.usuarioId,
      excluirUsuarioId: ator.usuarioId,
      de: deEvento(eventoId),
      onde: sql`e.situacao = 'CANCELADO' and ${inscritoSql}`,
    }),
  );
}

/**
 * Lembrete (chamado pelo JOB atrasado da fila, ADR-0011): para os inscritos com a preferência
 * "Lembretes" ligada, se o evento continua PUBLICADO, com o MESMO início do job (reagendado = job
 * velho não faz nada) e ainda não terminou. Chave por (evento, início): idempotente por membro.
 * LANÇA em erro de banco (o job tenta de novo); devolve quantos avisou.
 */
export async function notificarLembreteEvento(criadorId: string, eventoId: string, inicioEsperado: Date, agora = new Date()): Promise<number> {
  return enviar({
    criadorId,
    tipo: "EVENTO_LEMBRETE",
    dados: DADOS_EVENTO,
    chave: sql`${chaveDoLembrete(eventoId, inicioEsperado)}`,
    autorId: null,
    excluirUsuarioId: null,
    de: sql`${deEvento(eventoId)} join usuarios u on u.id = m.usuario_id`,
    onde: sql`e.situacao = 'PUBLICADO' and e.inicio_em = ${inicioEsperado} and e.inicio_em + make_interval(mins => e.duracao_min) > ${agora}
      and u.lembretes and ${inscritoSql}`,
  });
}

/**
 * Retenção (RN-134): arquiva (nunca apaga) as notificações com último evento há mais de
 * `RETENCAO_DIAS`. As leituras já ignoram as antigas pela data; isto só tira do índice.
 * ponytail: sem agendador ainda — rodar por job/cron quando houver; devolve quantas arquivou.
 */
export async function arquivarNotificacoesAntigas(agora = new Date(), dias = RETENCAO_DIAS): Promise<number> {
  const limite = new Date(agora.getTime() - dias * 86_400_000);
  const r = await db
    .update(notificacoes)
    .set({ arquivada_em: agora })
    .where(and(sql`${notificacoes.arquivada_em} is null`, sql`${notificacoes.evento_em} < ${limite}`, eq(notificacoes.is_deleted, false)))
    .returning({ id: notificacoes.id });
  return r.length;
}
