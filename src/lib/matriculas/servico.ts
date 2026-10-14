import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import type { Transacao } from "@/lib/db";
import type { OrigemMatricula } from "@/lib/db/schema/_enums";
import { criadores_grupos, criadores_grupos_membros, criadores_membros, produtos, produtos_matriculas, usuarios } from "@/lib/db/schema";
import { MSG_COLISAO, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { MSG_EXPIRACAO_PASSADA, expiracaoValida, matriculaVale } from "./regras";

/**
 * ESCRITA de matriculas (RN-116). Sempre dentro da transacao de quem chama, com o `criadorId` do
 * HOST (ou, no futuro webhook, o criador resolvido pela conta do gateway) — nunca de input.
 * Toda escrita grava a trilha (antes -> depois) na mesma transacao.
 */

/** `gateway:eventoId` — o mesmo formato do CHECK do banco. */
export const RE_REFERENCIA_EXTERNA = /^[a-z0-9-]{2,30}:\S{1,200}$/;

export interface PedidoMatricula {
  criadorId: string;
  membroId: string;
  produtoId: string;
  origem: OrigemMatricula;
  /** Nula/ausente = sem expiracao. Precisa ser futura. */
  expiraEm?: Date | null;
  /** Idempotencia do webhook: mesma referencia = mesma matricula, sem erro e sem mudar nada. */
  referenciaExterna?: string | null;
  /**
   * Usuario que fez (sessao). `null` = sistema (webhook): a linha fica com `modified_by` = a
   * propria pessoa matriculada e a trilha com `user_id` nulo.
   */
  autor: string | null;
  /** Trava otimista: a tela reativa a linha que ela abriu (outra versao = colisao). */
  versao?: Date;
  agora?: Date;
}

export type TipoResultadoMatricula = "criada" | "reativada" | "ja-existia";
export interface ResultadoMatricula {
  matriculaId: string;
  resultado: TipoResultadoMatricula;
}

const iso = (d: Date | null) => d?.toISOString() ?? null;

/**
 * PONTO DE ENTRADA DO GATEWAY (e de toda matricula: manual, grupo, CSV). Idempotente:
 *  - referencia ja gravada para o MESMO par -> devolve a matricula, nada muda;
 *  - par com matricula valendo -> fica como esta ("ja-existia");
 *  - par com matricula cancelada, pendente ou expirada -> REATIVA a mesma linha;
 *  - senao, cria. Uma matricula viva por (membro, produto), garantida tambem pelo banco.
 */
export async function matricular(tx: Transacao, p: PedidoMatricula): Promise<ResultadoMatricula> {
  const agora = p.agora ?? new Date();
  const expiraEm = p.expiraEm ?? null;
  const referencia = p.referenciaExterna ?? null;
  if (!expiracaoValida(expiraEm, agora)) throw new ErroDeNegocio(MSG_EXPIRACAO_PASSADA);
  if (referencia !== null && !RE_REFERENCIA_EXTERNA.test(referencia)) throw new ErroDeNegocio("Referência externa inválida.");

  // Serializa por par: duas entregas do mesmo evento (ou dois cliques) nunca correm juntas.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`matricula:${p.membroId}:${p.produtoId}`}, 0))`);

  const [membro] = await tx
    .select({ usuarioId: criadores_membros.usuario_id, email: usuarios.email })
    .from(criadores_membros)
    .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .where(and(eq(criadores_membros.id, p.membroId), eq(criadores_membros.criador_id, p.criadorId), vivos(criadores_membros)));
  if (!membro) throw new ErroDeNegocio("Membro não encontrado.");
  const [produto] = await tx
    .select({ titulo: produtos.titulo })
    .from(produtos)
    .where(and(eq(produtos.id, p.produtoId), eq(produtos.criador_id, p.criadorId), vivos(produtos)));
  if (!produto) throw new ErroDeNegocio("Produto não encontrado.");

  if (referencia !== null) {
    const [porReferencia] = await tx
      .select({ id: produtos_matriculas.id, membroId: produtos_matriculas.membro_id, produtoId: produtos_matriculas.produto_id })
      .from(produtos_matriculas)
      .where(and(eq(produtos_matriculas.criador_id, p.criadorId), eq(produtos_matriculas.referencia_externa, referencia)));
    if (porReferencia) {
      if (porReferencia.membroId !== p.membroId || porReferencia.produtoId !== p.produtoId) {
        throw new ErroDeNegocio("Referência externa já usada em outra matrícula.");
      }
      return { matriculaId: porReferencia.id, resultado: "ja-existia" };
    }
  }

  const [atual] = await tx
    .select()
    .from(produtos_matriculas)
    .where(
      and(
        eq(produtos_matriculas.criador_id, p.criadorId),
        eq(produtos_matriculas.membro_id, p.membroId),
        eq(produtos_matriculas.produto_id, p.produtoId),
        vivos(produtos_matriculas),
      ),
    );
  if (p.versao && atual?.updated_at.getTime() !== p.versao.getTime()) throw new ErroDeNegocio(MSG_COLISAO);

  const autorLinha = p.autor ?? membro.usuarioId;
  const trilha = { userId: p.autor, criadorId: p.criadorId, tabela: "produtos_matriculas" } as const;

  if (atual && matriculaVale({ status: atual.status, expiraEm: atual.expira_em }, agora)) {
    // ponytail: uma referencia por linha (a mais recente). Renovacao com varios eventos pede uma
    // tabela de eventos do gateway; entra junto com o webhook.
    if (referencia !== null && atual.referencia_externa !== referencia) {
      await registrarAuditoria(tx, {
        ...trilha,
        acao: "atualizar",
        registroId: atual.id,
        detalhes: `Referência externa da matrícula de ${membro.email} em "${produto.titulo}" (já estava ativa)`,
        dadosAnteriores: { referencia_externa: atual.referencia_externa },
        dadosNovos: { referencia_externa: referencia },
      });
      await tx
        .update(produtos_matriculas)
        .set({ referencia_externa: referencia, updated_at: agora, modified_by: autorLinha })
        .where(eq(produtos_matriculas.id, atual.id));
    }
    return { matriculaId: atual.id, resultado: "ja-existia" };
  }

  if (atual) {
    const depois = { status: "ATIVA" as const, origem: p.origem, iniciada_em: agora, expira_em: expiraEm, motivo_cancelamento: null, referencia_externa: referencia ?? atual.referencia_externa };
    await registrarAuditoria(tx, {
      ...trilha,
      acao: "atualizar",
      registroId: atual.id,
      detalhes: `Reativou a matrícula de ${membro.email} em "${produto.titulo}" (${p.origem})`,
      dadosAnteriores: { status: atual.status, origem: atual.origem, expira_em: iso(atual.expira_em), motivo_cancelamento: atual.motivo_cancelamento },
      dadosNovos: { ...depois, iniciada_em: iso(agora), expira_em: iso(expiraEm) },
    });
    // Mesma trava de quem edita pela tela (cancelar/expiracao nao pegam o lock do par).
    const [l] = await tx
      .update(produtos_matriculas)
      .set({ ...depois, updated_at: agora, modified_by: autorLinha })
      .where(travaDeColisao(produtos_matriculas, atual.id, atual.updated_at))
      .returning({ id: produtos_matriculas.id });
    if (!l) throw new ErroDeNegocio(MSG_COLISAO);
    return { matriculaId: atual.id, resultado: "reativada" };
  }

  const id = randomUUID();
  await registrarAuditoria(tx, {
    ...trilha,
    acao: "criar",
    registroId: id,
    detalhes: `Matriculou ${membro.email} em "${produto.titulo}" (${p.origem})`,
    dadosNovos: { membro_id: p.membroId, produto_id: p.produtoId, origem: p.origem, status: "ATIVA", expira_em: iso(expiraEm), referencia_externa: referencia },
  });
  await tx.insert(produtos_matriculas).values({
    id,
    criador_id: p.criadorId,
    membro_id: p.membroId,
    produto_id: p.produtoId,
    origem: p.origem,
    status: "ATIVA",
    iniciada_em: agora,
    expira_em: expiraEm,
    referencia_externa: referencia,
    modified_by: autorLinha,
  });
  return { matriculaId: id, resultado: "criada" };
}

/** Matricula DESTE criador na versao que a tela abriu (senao, colisao), com nomes para a trilha. */
async function matriculaTravada(tx: Transacao, criadorId: string, matriculaId: string, versao: Date) {
  const [m] = await tx
    .select({ linha: produtos_matriculas, email: usuarios.email, produto: produtos.titulo })
    .from(produtos_matriculas)
    .innerJoin(criadores_membros, eq(criadores_membros.id, produtos_matriculas.membro_id))
    .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .innerJoin(produtos, eq(produtos.id, produtos_matriculas.produto_id))
    .where(and(travaDeColisao(produtos_matriculas, matriculaId, versao), eq(produtos_matriculas.criador_id, criadorId)))
    .for("update", { of: produtos_matriculas });
  if (!m) throw new ErroDeNegocio(MSG_COLISAO);
  return m;
}

async function gravar(tx: Transacao, criadorId: string, matriculaId: string, versao: Date, valores: Partial<typeof produtos_matriculas.$inferInsert>) {
  const [l] = await tx
    .update(produtos_matriculas)
    .set(valores)
    .where(and(travaDeColisao(produtos_matriculas, matriculaId, versao), eq(produtos_matriculas.criador_id, criadorId)))
    .returning({ id: produtos_matriculas.id });
  if (!l) throw new ErroDeNegocio(MSG_COLISAO);
}

/** Cancelar = status + motivo (nunca delete). O acesso cai na proxima requisicao. */
export async function cancelarMatricula(
  tx: Transacao,
  p: { criadorId: string; matriculaId: string; versao: Date; motivo: string; autor: string },
) {
  const m = await matriculaTravada(tx, p.criadorId, p.matriculaId, p.versao);
  if (m.linha.status === "CANCELADA") throw new ErroDeNegocio("Esta matrícula já está cancelada.");
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "atualizar",
    tabela: "produtos_matriculas",
    registroId: m.linha.id,
    detalhes: `Cancelou a matrícula de ${m.email} em "${m.produto}": ${p.motivo}`,
    dadosAnteriores: { status: m.linha.status },
    dadosNovos: { status: "CANCELADA", motivo_cancelamento: p.motivo },
  });
  await gravar(tx, p.criadorId, m.linha.id, p.versao, { status: "CANCELADA", motivo_cancelamento: p.motivo, updated_at: new Date(), modified_by: p.autor });
}

/** Troca a expiracao (nula = sem expiracao). Matricula cancelada: reative antes. */
export async function alterarExpiracao(
  tx: Transacao,
  p: { criadorId: string; matriculaId: string; versao: Date; expiraEm: Date | null; autor: string; agora?: Date },
) {
  if (!expiracaoValida(p.expiraEm, p.agora ?? new Date())) throw new ErroDeNegocio(MSG_EXPIRACAO_PASSADA);
  const m = await matriculaTravada(tx, p.criadorId, p.matriculaId, p.versao);
  if (m.linha.status === "CANCELADA") throw new ErroDeNegocio("Matrícula cancelada: reative antes de mudar a expiração.");
  if (iso(m.linha.expira_em) === iso(p.expiraEm)) return;
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "atualizar",
    tabela: "produtos_matriculas",
    registroId: m.linha.id,
    detalhes: `Expiração da matrícula de ${m.email} em "${m.produto}"`,
    dadosAnteriores: { expira_em: iso(m.linha.expira_em) },
    dadosNovos: { expira_em: iso(p.expiraEm) },
  });
  await gravar(tx, p.criadorId, m.linha.id, p.versao, { expira_em: p.expiraEm, updated_at: new Date(), modified_by: p.autor });
}

export interface ContagemMatriculas {
  criadas: number;
  reativadas: number;
  jaExistiam: number;
}

export const contagemVazia = (): ContagemMatriculas => ({ criadas: 0, reativadas: 0, jaExistiam: 0 });

export function somar(c: ContagemMatriculas, r: TipoResultadoMatricula) {
  if (r === "criada") c.criadas++;
  else if (r === "reativada") c.reativadas++;
  else c.jaExistiam++;
}

/** Membros vivos do grupo DESTE criador (grupo de outro criador ou removido = erro). */
export async function membrosDoGrupo(tx: Transacao, criadorId: string, grupoId: string): Promise<string[]> {
  const [grupo] = await tx
    .select({ id: criadores_grupos.id })
    .from(criadores_grupos)
    .where(and(eq(criadores_grupos.id, grupoId), eq(criadores_grupos.criador_id, criadorId), vivos(criadores_grupos)));
  if (!grupo) throw new ErroDeNegocio("Grupo não encontrado.");
  const linhas = await tx
    .select({ membroId: criadores_membros.id })
    .from(criadores_grupos_membros)
    .innerJoin(criadores_membros, eq(criadores_membros.id, criadores_grupos_membros.membro_id))
    .where(
      and(
        eq(criadores_grupos_membros.grupo_id, grupoId),
        eq(criadores_grupos_membros.criador_id, criadorId),
        vivos(criadores_grupos_membros),
        vivos(criadores_membros),
      ),
    )
    // Ordem fixa: os locks por par saem sempre na mesma ordem (sem deadlock entre lotes).
    .orderBy(criadores_membros.id);
  return linhas.map((l) => l.membroId);
}

/**
 * Matricula o GRUPO inteiro (membros vivos de agora) no produto; quem ja tem fica como esta.
 * `novas` (opcional) recebe os ids criados/reativados (notificação depois do commit, RN-134).
 */
export async function matricularGrupo(
  tx: Transacao,
  p: Omit<PedidoMatricula, "membroId" | "referenciaExterna" | "versao"> & { grupoId: string },
  novas?: string[],
): Promise<ContagemMatriculas & { membros: number }> {
  const membros = await membrosDoGrupo(tx, p.criadorId, p.grupoId);
  const contagem = contagemVazia();
  for (const membroId of membros) {
    const r = await matricular(tx, { ...p, membroId });
    somar(contagem, r.resultado);
    if (r.resultado !== "ja-existia") novas?.push(r.matriculaId);
  }
  return { ...contagem, membros: membros.length };
}
