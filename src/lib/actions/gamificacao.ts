"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE, TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { db, type Transacao } from "@/lib/db";
import { criadores_desafios, criadores_desafios_grupos, criadores_desafios_participacoes, criadores_gamificacao, criadores_grupos, produtos, produtos_avaliacoes } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { participarDoDesafio } from "@/lib/gamificacao/desafios";
import { ajustarPontos, configDaGamificacao } from "@/lib/gamificacao/pontos";
import { recalcularPontos } from "@/lib/gamificacao/recalcular";
import { violouUnico } from "@/lib/membros/vinculos";
import { ajustePontosSchema, alvoDesafioSchema, configGamificacaoSchema, recompensaSchema, salvarDesafioSchema, type CamposDesafio } from "@/lib/validators/gamificacao";
import { idSchema } from "@/lib/validators/membros";

/**
 * Gamificação (ADR-0012, RN-144 a RN-147): configuração (só DONO), desafios e recompensas (DONO e
 * ADMIN), ajuste manual (DONO e ADMIN) e "Participar" (membro). Criador SEMPRE do host, papel lido
 * do banco (`exigirMembro`), Zod em tudo, trava por `updated_at`, trilha na mesma transação.
 */

const MSG_DESLIGADA = "A gamificação está desligada nesta área.";

/** Configuração. Criar = versão nula e nenhuma viva (o índice único recusa duas). Ligar = recálculo retroativo. */
export async function acaoSalvarConfigGamificacao(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(["DONO"]);
    const e = configGamificacaoSchema.parse(entrada);
    const g = criadores_gamificacao;
    const valores = {
      ligada: e.ligada,
      pontos_aula_concluida: e.pontos.aulaConcluida,
      pontos_curso_concluido: e.pontos.cursoConcluido,
      pontos_avaliacao_aprovada: e.pontos.avaliacaoAprovada,
      pontos_publicacao_comunidade: e.pontos.publicacaoComunidade,
      niveis: e.niveis,
    };
    const r = await db
      .transaction(async (tx) => {
        const antes = await configDaGamificacao(criador.id, tx);
        let id: string;
        let versao: Date;
        if (e.versao === null) {
          if (antes.id) throw new ErroDeNegocio(MSG_COLISAO);
          const [n] = await tx.insert(g).values({ criador_id: criador.id, ...valores, modified_by: usuario.id }).returning({ id: g.id, updated_at: g.updated_at });
          [id, versao] = [n.id, n.updated_at];
        } else {
          if (!antes.id) throw new ErroDeNegocio(MSG_COLISAO);
          const [n] = await tx
            .update(g)
            .set({ ...valores, updated_at: new Date(), modified_by: usuario.id })
            .where(and(travaDeColisao(g, antes.id, e.versao), eq(g.criador_id, criador.id)))
            .returning({ id: g.id, updated_at: g.updated_at });
          if (!n) throw new ErroDeNegocio(MSG_COLISAO);
          [id, versao] = [n.id, n.updated_at];
        }
        const mudouLigada = antes.ligada !== e.ligada;
        await registrarAuditoria(tx, {
          userId: usuario.id,
          criadorId: criador.id,
          acao: antes.id ? "atualizar" : "criar",
          tabela: "criadores_gamificacao",
          registroId: id,
          detalhes: mudouLigada ? `Gamificação ${e.ligada ? "ligada" : "desligada"}` : "Configuração da gamificação alterada (pontos e níveis)",
          dadosAnteriores: antes.id ? { ligada: antes.ligada, pontos: antes.pontos, niveis: antes.niveis } : undefined,
          dadosNovos: { ligada: e.ligada, pontos: e.pontos, niveis: e.niveis },
        });
        return { versao, ligou: e.ligada && !antes.ligada };
      })
      .catch((erro: unknown) => {
        if (violouUnico(erro)) throw new ErroDeNegocio(MSG_COLISAO);
        throw erro;
      });
    // Ligar = calcular o que os alunos já fizeram (idempotente; registra a própria trilha).
    const recalculo = r.ligou ? await recalcularPontos(criador.id) : null;
    return { versao: r.versao.toISOString(), recalculo };
  });
}

/** Curso, avaliação e grupos precisam ser VIVOS e DESTE criador (a FK composta só garante o criador). */
async function conferirAlvos(tx: Transacao, criadorId: string, c: CamposDesafio): Promise<void> {
  if (c.metaProdutoId) {
    const [p] = await tx.select({ id: produtos.id }).from(produtos).where(and(eq(produtos.id, c.metaProdutoId), eq(produtos.criador_id, criadorId), vivos(produtos)));
    if (!p) throw new ErroDeNegocio("Curso não encontrado.");
  }
  if (c.metaAvaliacaoId) {
    const a = produtos_avaliacoes;
    const [p] = await tx.select({ id: a.id }).from(a).where(and(eq(a.id, c.metaAvaliacaoId), eq(a.criador_id, criadorId), vivos(a)));
    if (!p) throw new ErroDeNegocio("Avaliação não encontrada.");
  }
  if (c.grupoIds.length) {
    const gs = await tx
      .select({ id: criadores_grupos.id })
      .from(criadores_grupos)
      .where(and(inArray(criadores_grupos.id, c.grupoIds), eq(criadores_grupos.criador_id, criadorId), vivos(criadores_grupos)));
    if (gs.length !== c.grupoIds.length) throw new ErroDeNegocio("Grupo não encontrado.");
  }
}

/** Troca os grupos do público: remove (soft) os que saíram e cria os que entraram. */
async function gravarGrupos(tx: Transacao, criadorId: string, desafioId: string, grupoIds: string[], usuarioId: string): Promise<void> {
  const dg = criadores_desafios_grupos;
  const atuais = await tx.select({ id: dg.id, grupoId: dg.grupo_id }).from(dg).where(and(eq(dg.desafio_id, desafioId), eq(dg.criador_id, criadorId), vivos(dg)));
  const sairam = atuais.filter((a) => !grupoIds.includes(a.grupoId)).map((a) => a.id);
  if (sairam.length) await tx.update(dg).set(marcaDeExclusao(usuarioId)).where(inArray(dg.id, sairam));
  const novos = grupoIds.filter((id) => !atuais.some((a) => a.grupoId === id));
  if (novos.length) await tx.insert(dg).values(novos.map((grupoId) => ({ criador_id: criadorId, desafio_id: desafioId, grupo_id: grupoId, modified_by: usuarioId })));
}

const linhaDoDesafio = (c: CamposDesafio) => ({
  titulo: c.titulo,
  descricao: c.descricao,
  inicio_em: c.inicioEm,
  fim_em: c.fimEm,
  meta_tipo: c.metaTipo,
  meta_quantidade: c.metaQuantidade,
  meta_produto_id: c.metaProdutoId,
  meta_avaliacao_id: c.metaAvaliacaoId,
  pontos_bonus: c.pontosBonus,
  recompensa: c.recompensa,
  publico: c.publico,
});

/** Criar (rascunho) ou salvar. Encerrado não se edita. */
export async function acaoSalvarDesafio(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = salvarDesafioSchema.parse(entrada);
    const d = criadores_desafios;
    return db.transaction(async (tx) => {
      await conferirAlvos(tx, criador.id, e.campos);
      const linha = linhaDoDesafio(e.campos);
      if (!e.desafioId) {
        const [n] = await tx
          .insert(d)
          .values({ criador_id: criador.id, ...linha, situacao: "RASCUNHO", criado_por: usuario.id, modified_by: usuario.id })
          .returning({ id: d.id, updated_at: d.updated_at });
        await gravarGrupos(tx, criador.id, n.id, e.campos.grupoIds, usuario.id);
        await registrarAuditoria(tx, {
          userId: usuario.id,
          criadorId: criador.id,
          acao: "criar",
          tabela: "criadores_desafios",
          registroId: n.id,
          detalhes: `Criou o desafio "${e.campos.titulo}" (rascunho)`,
          dadosNovos: { ...linha, grupos: e.campos.grupoIds },
        });
        return { id: n.id, versao: n.updated_at.toISOString() };
      }
      if (!e.versao) throw new ErroDeNegocio(MSG_COLISAO);
      const alvo = and(travaDeColisao(d, e.desafioId, e.versao), eq(d.criador_id, criador.id));
      const [antes] = await tx.select().from(d).where(alvo).for("update");
      if (!antes) throw new ErroDeNegocio(MSG_COLISAO);
      if (antes.situacao === "ENCERRADO") throw new ErroDeNegocio("Desafio encerrado não pode ser editado.");
      const [n] = await tx.update(d).set({ ...linha, updated_at: new Date(), modified_by: usuario.id }).where(alvo).returning({ updated_at: d.updated_at });
      if (!n) throw new ErroDeNegocio(MSG_COLISAO);
      await gravarGrupos(tx, criador.id, e.desafioId, e.campos.grupoIds, usuario.id);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "criadores_desafios",
        registroId: e.desafioId,
        detalhes: `Editou o desafio "${antes.titulo}"${antes.titulo !== e.campos.titulo ? ` → "${e.campos.titulo}"` : ""}`,
        dadosAnteriores: linhaDoDesafio({
          titulo: antes.titulo, descricao: antes.descricao, inicioEm: antes.inicio_em, fimEm: antes.fim_em, metaTipo: antes.meta_tipo, metaQuantidade: antes.meta_quantidade,
          metaProdutoId: antes.meta_produto_id, metaAvaliacaoId: antes.meta_avaliacao_id, pontosBonus: antes.pontos_bonus, recompensa: antes.recompensa, publico: antes.publico, grupoIds: [],
        }),
        dadosNovos: { ...linha, grupos: e.campos.grupoIds },
      });
      return { id: e.desafioId, versao: n.updated_at.toISOString() };
    });
  });
}

type Transicao = "publicar" | "encerrar" | "excluir";
const DE: Record<Transicao, string> = { publicar: "RASCUNHO", encerrar: "PUBLICADO", excluir: "RASCUNHO" };
const RECUSA: Record<Transicao, string> = {
  publicar: "Só rascunho pode ser publicado.",
  encerrar: "Só desafio publicado pode ser encerrado.",
  excluir: "Só rascunho pode ser excluído (publicado: encerre).",
};

/** Rascunho → Publicado → Encerrado; excluir só rascunho (soft delete, com os grupos). */
async function transicionar(entrada: unknown, t: Transicao) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = alvoDesafioSchema.parse(entrada);
    const d = criadores_desafios;
    const agora = new Date();
    return db.transaction(async (tx) => {
      const alvo = and(travaDeColisao(d, e.desafioId, e.versao), eq(d.criador_id, criador.id));
      const [antes] = await tx.select({ titulo: d.titulo, situacao: d.situacao, fim: d.fim_em }).from(d).where(alvo).for("update");
      if (!antes) throw new ErroDeNegocio(MSG_COLISAO);
      if (antes.situacao !== DE[t]) throw new ErroDeNegocio(RECUSA[t]);
      if (t === "publicar" && antes.fim.getTime() <= agora.getTime()) throw new ErroDeNegocio("O fim do desafio já passou: ajuste as datas antes de publicar.");
      const situacao = t === "publicar" ? ("PUBLICADO" as const) : ("ENCERRADO" as const);
      const set = t === "excluir" ? marcaDeExclusao(usuario.id) : { situacao, updated_at: agora, modified_by: usuario.id };
      const [n] = await tx.update(d).set(set).where(alvo).returning({ updated_at: d.updated_at });
      if (!n) throw new ErroDeNegocio(MSG_COLISAO);
      if (t === "excluir") {
        const dg = criadores_desafios_grupos;
        await tx.update(dg).set(marcaDeExclusao(usuario.id)).where(and(eq(dg.desafio_id, e.desafioId), eq(dg.criador_id, criador.id), vivos(dg)));
      }
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: t === "excluir" ? "excluir" : t === "publicar" ? "publicar" : "atualizar",
        tabela: "criadores_desafios",
        registroId: e.desafioId,
        detalhes: { publicar: `Publicou o desafio "${antes.titulo}"`, encerrar: `Encerrou o desafio "${antes.titulo}"`, excluir: `Excluiu o rascunho do desafio "${antes.titulo}" (exclusão lógica)` }[t],
        dadosAnteriores: { situacao: antes.situacao },
        dadosNovos: t === "excluir" ? { is_deleted: true } : { situacao },
      });
      return { versao: n.updated_at.toISOString() };
    });
  });
}

export async function acaoPublicarDesafio(entrada: unknown) {
  return transicionar(entrada, "publicar");
}
export async function acaoEncerrarDesafio(entrada: unknown) {
  return transicionar(entrada, "encerrar");
}
export async function acaoExcluirDesafio(entrada: unknown) {
  return transicionar(entrada, "excluir");
}

/** Equipe marca a recompensa como entregue (participação concluída, desafio com recompensa), com trava. */
export async function acaoMarcarRecompensaEntregue(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = recompensaSchema.parse(entrada);
    const dp = criadores_desafios_participacoes;
    return db.transaction(async (tx) => {
      const alvo = and(travaDeColisao(dp, e.participacaoId, e.versao), eq(dp.criador_id, criador.id));
      const [antes] = await tx
        .select({ concluido: dp.concluido_em, entregue: dp.recompensa_entregue_em, membroId: dp.membro_id, titulo: criadores_desafios.titulo, recompensa: criadores_desafios.recompensa })
        .from(dp)
        .innerJoin(criadores_desafios, and(eq(criadores_desafios.id, dp.desafio_id), vivos(criadores_desafios)))
        .where(alvo)
        .for("update", { of: dp });
      if (!antes) throw new ErroDeNegocio(MSG_COLISAO);
      if (!antes.concluido || !antes.recompensa) throw new ErroDeNegocio("Esta participação não tem recompensa a entregar.");
      if (antes.entregue) throw new ErroDeNegocio("A recompensa já foi marcada como entregue.");
      const agora = new Date();
      const [n] = await tx
        .update(dp)
        .set({ recompensa_entregue_em: agora, recompensa_entregue_por: usuario.id, updated_at: agora, modified_by: usuario.id })
        .where(and(alvo, isNull(dp.recompensa_entregue_em)))
        .returning({ updated_at: dp.updated_at });
      if (!n) throw new ErroDeNegocio(MSG_COLISAO);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "criadores_desafios_participacoes",
        registroId: e.participacaoId,
        detalhes: `Recompensa "${antes.recompensa}" do desafio "${antes.titulo}" entregue ao membro ${antes.membroId}`,
        dadosAnteriores: { recompensa_entregue_em: null },
        dadosNovos: { recompensa_entregue_em: agora.toISOString(), recompensa_entregue_por: usuario.id },
      });
      return { versao: n.updated_at.toISOString() };
    });
  });
}

/** Ajuste manual (RN-145): DONO e ADMIN, só ALUNO deste criador, justificativa obrigatória, trilha na transação. */
export async function acaoAjustarPontos(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = ajustePontosSchema.parse(entrada);
    const id = await db.transaction((tx) => ajustarPontos(tx, { criadorId: criador.id, membroId: e.membroId, pontos: e.pontos, justificativa: e.justificativa, autorUsuarioId: usuario.id }));
    return { id };
  });
}

/** "Participar" (opt-in) do PRÓPRIO membro da sessão; nenhum id de pessoa no corpo. */
export async function acaoParticiparDoDesafio(entrada: unknown) {
  return executar(async () => {
    const q = await exigirMembro(TODOS_OS_MEMBROS);
    const { desafioId } = z.strictObject({ desafioId: idSchema }).parse(entrada);
    if (!(await configDaGamificacao(q.criador.id)).ligada) throw new ErroDeNegocio(MSG_DESLIGADA);
    const entrou = await participarDoDesafio(q, desafioId, new Date());
    return { entrou };
  });
}
