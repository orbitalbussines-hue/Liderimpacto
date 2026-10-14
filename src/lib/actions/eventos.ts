"use server";

import { and, eq, inArray, notInArray } from "drizzle-orm";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE, TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { primeiroNome } from "@/lib/comunidade/regras";
import { db, type Transacao } from "@/lib/db";
import { criadores_eventos as eventos, criadores_eventos_grupos as eventosGrupos, criadores_grupos as grupos, produtos, produtos_modulos_aulas as aulas } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { enfileirarLembreteComPrazo } from "@/lib/eventos/fila";
import { cancelarPresenca, confirmarPresenca } from "@/lib/eventos/presenca";
import { fimDoEvento } from "@/lib/eventos/regras";
import { notificarEventoCancelado, notificarEventoPublicado } from "@/lib/notificacoes/gerar";
import { type CamposEvento, criarEventoSchema, eventoComVersaoSchema, presencaSchema, salvarEventoSchema } from "@/lib/validators/eventos";

/**
 * Eventos ao vivo — equipe (DONO e ADMIN, criador do HOST) e presença do aluno. ADR-0011, RN-142,
 * RN-143. Rascunho → Publicado → Cancelado; excluir só rascunho (soft delete). Toda escrita com
 * trava por `updated_at` e trilha na mesma transação. Avisos e o lembrete da fila saem DEPOIS do
 * commit e nunca derrubam a ação.
 */

const NAO_ENCONTRADO = "Evento não encontrado nesta área. Recarregue a página.";

type Membro = Awaited<ReturnType<typeof exigirMembro>>;
const ator = (m: Membro) => ({ usuarioId: m.usuario.id, membroId: m.membro.id, nome: primeiroNome(m.usuario.nome) });

async function travarEvento(tx: Transacao, criadorId: string, eventoId: string) {
  const [e] = await tx
    .select()
    .from(eventos)
    .where(and(eq(eventos.id, eventoId), eq(eventos.criador_id, criadorId), vivos(eventos)))
    .for("update");
  if (!e) throw new ErroDeNegocio(NAO_ENCONTRADO);
  return e;
}

/** Curso, aula e grupos precisam ser DESTA área e vivos (a FK composta recusaria os de fora; aqui vira mensagem). */
async function conferirReferencias(tx: Transacao, criadorId: string, c: CamposEvento) {
  if (c.produtoId) {
    const [p] = await tx.select({ id: produtos.id }).from(produtos).where(and(eq(produtos.id, c.produtoId), eq(produtos.criador_id, criadorId), vivos(produtos)));
    if (!p) throw new ErroDeNegocio("Curso não encontrado nesta área.");
  }
  if (c.gravacaoAulaId) {
    const [a] = await tx.select({ id: aulas.id }).from(aulas).where(and(eq(aulas.id, c.gravacaoAulaId), eq(aulas.criador_id, criadorId), vivos(aulas)));
    if (!a) throw new ErroDeNegocio("Aula da gravação não encontrada nesta área.");
  }
  if (c.grupoIds.length) {
    const gs = await tx.select({ id: grupos.id }).from(grupos).where(and(inArray(grupos.id, c.grupoIds), eq(grupos.criador_id, criadorId), vivos(grupos)));
    if (gs.length !== c.grupoIds.length) throw new ErroDeNegocio("Grupo não encontrado nesta área. Recarregue a página.");
  }
}

/** Deixa vivos exatamente os grupos pedidos (os que saem: soft delete; os novos: inseridos). */
async function gravarGrupos(tx: Transacao, criadorId: string, eventoId: string, grupoIds: string[], usuarioId: string) {
  await tx
    .update(eventosGrupos)
    .set(marcaDeExclusao(usuarioId))
    .where(and(eq(eventosGrupos.evento_id, eventoId), vivos(eventosGrupos), grupoIds.length ? notInArray(eventosGrupos.grupo_id, grupoIds) : undefined));
  if (!grupoIds.length) return;
  const ja = await tx.select({ id: eventosGrupos.grupo_id }).from(eventosGrupos).where(and(eq(eventosGrupos.evento_id, eventoId), vivos(eventosGrupos)));
  const novos = grupoIds.filter((g) => !ja.some((j) => j.id === g));
  if (novos.length) await tx.insert(eventosGrupos).values(novos.map((grupo_id) => ({ criador_id: criadorId, evento_id: eventoId, grupo_id, modified_by: usuarioId })));
}

/** Colunas do evento a partir dos campos validados (campo a campo, nunca o corpo inteiro). */
const colunas = (c: CamposEvento) => ({
  titulo: c.titulo,
  descricao: c.descricao,
  inicio_em: c.inicio,
  duracao_min: c.duracaoMin,
  link_acesso: c.link,
  publico: c.publico,
  produto_id: c.produtoId,
  gravacao_aula_id: c.gravacaoAulaId,
});

/** Retrato para a trilha (sem o link inteiro: só se há link). */
const retrato = (c: ReturnType<typeof colunas>, grupoIds: string[]) => ({ ...c, link_acesso: c.link_acesso ? "(definido)" : null, grupos: grupoIds });

/** Cria em RASCUNHO (o link pode ficar para depois). */
export async function acaoCriarEvento(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const c = criarEventoSchema.parse(entrada);
    return db.transaction(async (tx) => {
      await conferirReferencias(tx, criador.id, c);
      const v = colunas(c);
      const [e] = await tx
        .insert(eventos)
        .values({ criador_id: criador.id, ...v, situacao: "RASCUNHO", criado_por: usuario.id, modified_by: usuario.id })
        .returning({ id: eventos.id, updated_at: eventos.updated_at });
      await gravarGrupos(tx, criador.id, e.id, c.grupoIds, usuario.id);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "criar",
        tabela: "criadores_eventos",
        registroId: e.id,
        detalhes: `Criou o evento "${c.titulo}" (rascunho)`,
        dadosNovos: retrato(v, c.grupoIds),
      });
      return { id: e.id, versao: e.updated_at.toISOString() };
    });
  });
}

/**
 * Salva os dados. Cancelado não se edita. Publicado: o link continua obrigatório; mudou o início =
 * lembrete reprogramado (o job do horário velho vira no-op); quem passou a ser do público (e ainda
 * não foi avisado) recebe o aviso de publicado — a chave por evento não repete para quem já recebeu.
 */
export async function acaoSalvarEvento(entrada: unknown) {
  return executar(async () => {
    const m = await exigirMembro(EQUIPE);
    const { usuario, criador } = m;
    const { eventoId, versao, campos: c } = salvarEventoSchema.parse(entrada);
    const agora = new Date();
    const r = await db.transaction(async (tx) => {
      const antes = await travarEvento(tx, criador.id, eventoId);
      if (antes.situacao === "CANCELADO") throw new ErroDeNegocio("Evento cancelado não pode ser editado.");
      if (antes.situacao === "PUBLICADO" && !c.link) throw new ErroDeNegocio("Evento publicado precisa do link da sala.");
      await conferirReferencias(tx, criador.id, c);
      const gruposAntes = (await tx.select({ id: eventosGrupos.grupo_id }).from(eventosGrupos).where(and(eq(eventosGrupos.evento_id, antes.id), vivos(eventosGrupos)))).map((g) => g.id);
      const v = colunas(c);
      const [l] = await tx
        .update(eventos)
        .set({ ...v, updated_at: agora, modified_by: usuario.id })
        .where(and(travaDeColisao(eventos, eventoId, versao), eq(eventos.criador_id, criador.id)))
        .returning({ updated_at: eventos.updated_at });
      if (!l) throw new ErroDeNegocio(MSG_COLISAO);
      await gravarGrupos(tx, criador.id, antes.id, c.grupoIds, usuario.id);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "criadores_eventos",
        registroId: antes.id,
        detalhes: `Editou o evento "${antes.titulo}"`,
        dadosAnteriores: retrato(
          { titulo: antes.titulo, descricao: antes.descricao, inicio_em: antes.inicio_em, duracao_min: antes.duracao_min, link_acesso: antes.link_acesso, publico: antes.publico, produto_id: antes.produto_id, gravacao_aula_id: antes.gravacao_aula_id },
          gruposAntes,
        ),
        dadosNovos: retrato(v, c.grupoIds),
      });
      return { versao: l.updated_at.toISOString(), publicado: antes.situacao === "PUBLICADO", mudouInicio: antes.inicio_em.getTime() !== c.inicio.getTime() };
    });
    let lembreteEnfileirado: boolean | null = null;
    if (r.publicado && fimDoEvento({ inicioEm: c.inicio, duracaoMin: c.duracaoMin }) > agora) {
      if (r.mudouInicio && c.inicio > agora) lembreteEnfileirado = await enfileirarLembreteComPrazo(criador.id, eventoId, c.inicio);
      await notificarEventoPublicado(criador.id, eventoId, ator(m), agora);
    }
    return { versao: r.versao, lembreteEnfileirado };
  });
}

/** Rascunho → Publicado: exige link e que o encontro não tenha terminado. Avisa o público e agenda o lembrete. */
export async function acaoPublicarEvento(entrada: unknown) {
  return executar(async () => {
    const m = await exigirMembro(EQUIPE);
    const { usuario, criador } = m;
    const e = eventoComVersaoSchema.parse(entrada);
    const agora = new Date();
    const r = await db.transaction(async (tx) => {
      const antes = await travarEvento(tx, criador.id, e.eventoId);
      if (antes.situacao !== "RASCUNHO") throw new ErroDeNegocio(MSG_COLISAO);
      if (!antes.link_acesso) throw new ErroDeNegocio("Para publicar, informe o link da sala (https).");
      if (fimDoEvento({ inicioEm: antes.inicio_em, duracaoMin: antes.duracao_min }) <= agora) throw new ErroDeNegocio("Este encontro já terminou. Ajuste a data e a hora antes de publicar.");
      const [l] = await tx
        .update(eventos)
        .set({ situacao: "PUBLICADO", publicado_em: agora, updated_at: agora, modified_by: usuario.id })
        .where(and(travaDeColisao(eventos, e.eventoId, e.versao), eq(eventos.criador_id, criador.id)))
        .returning({ updated_at: eventos.updated_at });
      if (!l) throw new ErroDeNegocio(MSG_COLISAO);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "publicar",
        tabela: "criadores_eventos",
        registroId: antes.id,
        detalhes: `Publicou o evento "${antes.titulo}"`,
        dadosAnteriores: { situacao: "RASCUNHO" },
        dadosNovos: { situacao: "PUBLICADO" },
      });
      return { versao: l.updated_at.toISOString(), inicioEm: antes.inicio_em };
    });
    await notificarEventoPublicado(criador.id, e.eventoId, ator(m), agora);
    const lembreteEnfileirado = r.inicioEm > agora ? await enfileirarLembreteComPrazo(criador.id, e.eventoId, r.inicioEm) : null;
    return { versao: r.versao, lembreteEnfileirado };
  });
}

/** Publicado → Cancelado (antes do fim). Avisa quem confirmou; o lembrete na fila vira no-op. */
export async function acaoCancelarEvento(entrada: unknown) {
  return executar(async () => {
    const m = await exigirMembro(EQUIPE);
    const { usuario, criador } = m;
    const e = eventoComVersaoSchema.parse(entrada);
    const agora = new Date();
    const versao = await db.transaction(async (tx) => {
      const antes = await travarEvento(tx, criador.id, e.eventoId);
      if (antes.situacao !== "PUBLICADO") throw new ErroDeNegocio(antes.situacao === "RASCUNHO" ? "Rascunho não se cancela: exclua." : MSG_COLISAO);
      if (fimDoEvento({ inicioEm: antes.inicio_em, duracaoMin: antes.duracao_min }) <= agora) throw new ErroDeNegocio("Este encontro já terminou.");
      const [l] = await tx
        .update(eventos)
        .set({ situacao: "CANCELADO", cancelado_em: agora, updated_at: agora, modified_by: usuario.id })
        .where(and(travaDeColisao(eventos, e.eventoId, e.versao), eq(eventos.criador_id, criador.id)))
        .returning({ updated_at: eventos.updated_at });
      if (!l) throw new ErroDeNegocio(MSG_COLISAO);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "criadores_eventos",
        registroId: antes.id,
        detalhes: `Cancelou o evento "${antes.titulo}"`,
        dadosAnteriores: { situacao: "PUBLICADO" },
        dadosNovos: { situacao: "CANCELADO" },
      });
      return l.updated_at.toISOString();
    });
    await notificarEventoCancelado(criador.id, e.eventoId, ator(m));
    return { versao };
  });
}

/** Exclui (soft delete) um RASCUNHO e os grupos dele. Publicado se cancela, não se exclui. */
export async function acaoExcluirEvento(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = eventoComVersaoSchema.parse(entrada);
    await db.transaction(async (tx) => {
      const antes = await travarEvento(tx, criador.id, e.eventoId);
      if (antes.situacao !== "RASCUNHO") throw new ErroDeNegocio("Só rascunho pode ser excluído. Evento publicado se cancela.");
      const [l] = await tx
        .update(eventos)
        .set(marcaDeExclusao(usuario.id))
        .where(and(travaDeColisao(eventos, e.eventoId, e.versao), eq(eventos.criador_id, criador.id)))
        .returning({ id: eventos.id });
      if (!l) throw new ErroDeNegocio(MSG_COLISAO);
      await tx.update(eventosGrupos).set(marcaDeExclusao(usuario.id)).where(and(eq(eventosGrupos.evento_id, antes.id), vivos(eventosGrupos)));
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "excluir",
        tabela: "criadores_eventos",
        registroId: antes.id,
        detalhes: `Excluiu o rascunho do evento "${antes.titulo}" (exclusão lógica)`,
        dadosAnteriores: { titulo: antes.titulo, situacao: antes.situacao },
      });
    });
    return null;
  });
}

/** "Vou participar" — a PRÓPRIA presença (nenhum id de pessoa no corpo). */
export async function acaoConfirmarPresenca(entrada: unknown) {
  return executar(async () => {
    const q = await exigirMembro(TODOS_OS_MEMBROS);
    const { eventoId } = presencaSchema.parse(entrada);
    return { confirmou: await confirmarPresenca(q, eventoId, new Date()) };
  });
}

/** "Não vou mais" — a PRÓPRIA presença, até o fim do encontro. */
export async function acaoCancelarPresenca(entrada: unknown) {
  return executar(async () => {
    const q = await exigirMembro(TODOS_OS_MEMBROS);
    const { eventoId } = presencaSchema.parse(entrada);
    return { cancelou: await cancelarPresenca(q, eventoId, new Date()) };
  });
}
