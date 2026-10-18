import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import type { Transacao } from "@/lib/db";
import type { SituacaoVoucher } from "@/lib/db/schema/_enums";
import { criadores_vouchers, criadores_vouchers_produtos, criadores_vouchers_resgates, produtos, produtos_matriculas, type MatriculaDoResgate } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { valeAgora } from "@/lib/matriculas/consultas";
import { matricular } from "@/lib/matriculas/servico";
import { violouUnico } from "@/lib/membros/vinculos";
import { TEXTO_RECUSA_RESGATE, expiracaoDoResgate, gerarCodigoVoucher, motivoRecusaResgate, transicaoVoucherValida } from "./regras";

/**
 * ESCRITA dos vouchers (RN-201), na transação de quem chama, criador do HOST, trilha junto.
 * O resgate trava a linha do voucher (`FOR UPDATE`): os limites são contados com o voucher preso,
 * então dois resgates simultâneos nunca passam do limite. Cada produto passa por `matricular`
 * (origem VOUCHER, referência `voucher:<resgate>:<produto>`).
 */

const TABELA = "criadores_vouchers";
export const MSG_CODIGO_DUPLICADO = "Já existe um voucher com este código.";
export const MSG_VOUCHER_NAO_ENCONTRADO = "Voucher não encontrado.";

export interface CamposVoucher {
  descricao: string;
  validoAte: Date | null;
  limiteUsos: number | null;
  limitePorPessoa: number;
  diasAcesso: number | null;
  produtoIds: readonly string[];
}

const iso = (d: Date | null) => d?.toISOString() ?? null;

function conferirCampos(c: CamposVoucher, agora: Date) {
  if (c.validoAte && c.validoAte.getTime() <= agora.getTime()) throw new ErroDeNegocio("A validade precisa ser uma data futura.");
  if (c.limiteUsos !== null && c.limitePorPessoa > c.limiteUsos) throw new ErroDeNegocio("O limite por pessoa não pode passar do limite total.");
}

/** Produtos vivos DESTE criador (outro criador ou removido = recusa). */
async function conferirProdutos(tx: Transacao, criadorId: string, produtoIds: readonly string[]) {
  const ids = [...new Set(produtoIds)].sort();
  const achados = await tx.select({ id: produtos.id }).from(produtos).where(and(inArray(produtos.id, ids), eq(produtos.criador_id, criadorId), vivos(produtos)));
  if (achados.length !== ids.length) throw new ErroDeNegocio("Curso não encontrado.");
  return ids;
}

const linhaDoVoucher = (c: CamposVoucher) => ({
  descricao: c.descricao,
  valido_ate: c.validoAte,
  limite_usos: c.limiteUsos,
  limite_por_pessoa: c.limitePorPessoa,
  dias_acesso: c.diasAcesso,
});

const paraTrilha = (c: CamposVoucher) => ({ ...linhaDoVoucher(c), valido_ate: iso(c.validoAte), produto_ids: [...c.produtoIds].sort() });

export async function criarVoucher(
  tx: Transacao,
  p: CamposVoucher & { criadorId: string; autor: string; codigo: string | null; agora?: Date },
): Promise<{ id: string; codigo: string; versao: Date }> {
  conferirCampos(p, p.agora ?? new Date());
  const produtoIds = await conferirProdutos(tx, p.criadorId, p.produtoIds);
  let codigo = p.codigo;
  // Código gerado: 32^8 combinações; confere antes para não abortar a transação num UNIQUE.
  for (let i = 0; codigo === null && i < 5; i++) {
    const candidato = gerarCodigoVoucher();
    const [existe] = await tx.select({ id: criadores_vouchers.id }).from(criadores_vouchers).where(and(eq(criadores_vouchers.criador_id, p.criadorId), eq(criadores_vouchers.codigo, candidato), vivos(criadores_vouchers)));
    if (!existe) codigo = candidato;
  }
  if (codigo === null) throw new ErroDeNegocio("Não foi possível gerar um código. Tente de novo.");
  const [v] = await tx
    .insert(criadores_vouchers)
    .values({ criador_id: p.criadorId, codigo, ...linhaDoVoucher(p), modified_by: p.autor })
    .returning({ id: criadores_vouchers.id, versao: criadores_vouchers.updated_at })
    .catch((e: unknown) => {
      if (violouUnico(e)) throw new ErroDeNegocio(MSG_CODIGO_DUPLICADO);
      throw e;
    });
  await tx.insert(criadores_vouchers_produtos).values(produtoIds.map((produtoId) => ({ criador_id: p.criadorId, voucher_id: v.id, produto_id: produtoId, modified_by: p.autor })));
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "criar", tabela: TABELA, registroId: v.id, detalhes: `Criou o voucher ${codigo}`, dadosNovos: { codigo, ...paraTrilha(p) } });
  return { id: v.id, codigo, versao: v.versao };
}

async function voucherTravado(tx: Transacao, criadorId: string, voucherId: string, versao: Date) {
  const [v] = await tx
    .select()
    .from(criadores_vouchers)
    .where(and(travaDeColisao(criadores_vouchers, voucherId, versao), eq(criadores_vouchers.criador_id, criadorId)))
    .for("update");
  if (!v) throw new ErroDeNegocio(MSG_COLISAO);
  return v;
}

async function produtosDoVoucher(tx: Transacao, voucherId: string): Promise<string[]> {
  const linhas = await tx
    .select({ produtoId: criadores_vouchers_produtos.produto_id })
    .from(criadores_vouchers_produtos)
    .where(and(eq(criadores_vouchers_produtos.voucher_id, voucherId), vivos(criadores_vouchers_produtos)));
  return linhas.map((l) => l.produtoId).sort();
}

export async function salvarVoucher(
  tx: Transacao,
  p: CamposVoucher & { criadorId: string; autor: string; voucherId: string; versao: Date; agora?: Date },
): Promise<{ versao: Date }> {
  const antes = await voucherTravado(tx, p.criadorId, p.voucherId, p.versao);
  if (antes.situacao === "ENCERRADO") throw new ErroDeNegocio("Voucher encerrado não pode ser editado.");
  // Validade no passado só é recusada se MUDOU (salvar outro campo de um voucher vencido continua possível).
  conferirCampos({ ...p, validoAte: iso(p.validoAte) === iso(antes.valido_ate) ? null : p.validoAte }, p.agora ?? new Date());
  const novos = await conferirProdutos(tx, p.criadorId, p.produtoIds);
  const atuais = await produtosDoVoucher(tx, p.voucherId);
  const sair = atuais.filter((id) => !novos.includes(id));
  const entrar = novos.filter((id) => !atuais.includes(id));
  const agora = new Date();
  if (sair.length) {
    await tx
      .update(criadores_vouchers_produtos)
      .set(marcaDeExclusao(p.autor))
      .where(and(eq(criadores_vouchers_produtos.voucher_id, p.voucherId), inArray(criadores_vouchers_produtos.produto_id, sair), vivos(criadores_vouchers_produtos)));
  }
  if (entrar.length) {
    await tx.insert(criadores_vouchers_produtos).values(entrar.map((produtoId) => ({ criador_id: p.criadorId, voucher_id: p.voucherId, produto_id: produtoId, modified_by: p.autor })));
  }
  const [v] = await tx
    .update(criadores_vouchers)
    .set({ ...linhaDoVoucher(p), updated_at: agora, modified_by: p.autor })
    .where(and(travaDeColisao(criadores_vouchers, p.voucherId, p.versao), eq(criadores_vouchers.criador_id, p.criadorId)))
    .returning({ versao: criadores_vouchers.updated_at });
  if (!v) throw new ErroDeNegocio(MSG_COLISAO);
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "atualizar",
    tabela: TABELA,
    registroId: p.voucherId,
    detalhes: `Editou o voucher ${antes.codigo}`,
    dadosAnteriores: { descricao: antes.descricao, valido_ate: iso(antes.valido_ate), limite_usos: antes.limite_usos, limite_por_pessoa: antes.limite_por_pessoa, dias_acesso: antes.dias_acesso, produto_ids: atuais },
    dadosNovos: paraTrilha(p),
  });
  return v;
}

/** ATIVO ⇄ PAUSADO; ENCERRADO é final. */
export async function mudarSituacaoVoucher(
  tx: Transacao,
  p: { criadorId: string; autor: string; voucherId: string; versao: Date; situacao: SituacaoVoucher },
): Promise<{ versao: Date }> {
  const antes = await voucherTravado(tx, p.criadorId, p.voucherId, p.versao);
  if (!transicaoVoucherValida(antes.situacao, p.situacao)) throw new ErroDeNegocio(antes.situacao === "ENCERRADO" ? "Voucher encerrado não volta a valer." : "O voucher já está nesta situação.");
  const [v] = await tx
    .update(criadores_vouchers)
    .set({ situacao: p.situacao, updated_at: new Date(), modified_by: p.autor })
    .where(and(travaDeColisao(criadores_vouchers, p.voucherId, p.versao), eq(criadores_vouchers.criador_id, p.criadorId)))
    .returning({ versao: criadores_vouchers.updated_at });
  if (!v) throw new ErroDeNegocio(MSG_COLISAO);
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "atualizar",
    tabela: TABELA,
    registroId: p.voucherId,
    detalhes: `Voucher ${antes.codigo}: ${antes.situacao} → ${p.situacao}`,
    dadosAnteriores: { situacao: antes.situacao },
    dadosNovos: { situacao: p.situacao },
  });
  return v;
}

/** Só sem resgates (com resgates, encerre: o histórico continua ligado ao voucher). */
export async function excluirVoucher(tx: Transacao, p: { criadorId: string; autor: string; voucherId: string; versao: Date }): Promise<void> {
  const antes = await voucherTravado(tx, p.criadorId, p.voucherId, p.versao);
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(criadores_vouchers_resgates).where(and(eq(criadores_vouchers_resgates.voucher_id, p.voucherId), vivos(criadores_vouchers_resgates)));
  if ((r?.n ?? 0) > 0) throw new ErroDeNegocio("Este voucher já foi resgatado: encerre em vez de excluir.");
  await tx
    .update(criadores_vouchers_produtos)
    .set(marcaDeExclusao(p.autor))
    .where(and(eq(criadores_vouchers_produtos.voucher_id, p.voucherId), vivos(criadores_vouchers_produtos)));
  const [v] = await tx
    .update(criadores_vouchers)
    .set(marcaDeExclusao(p.autor))
    .where(and(travaDeColisao(criadores_vouchers, p.voucherId, p.versao), eq(criadores_vouchers.criador_id, p.criadorId)))
    .returning({ id: criadores_vouchers.id });
  if (!v) throw new ErroDeNegocio(MSG_COLISAO);
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "excluir", tabela: TABELA, registroId: p.voucherId, detalhes: `Excluiu o voucher ${antes.codigo}`, dadosAnteriores: { codigo: antes.codigo, situacao: antes.situacao } });
}

export interface ResultadoResgate {
  resgateId: string;
  voucherId: string;
  matriculas: MatriculaDoResgate[];
  /** Criadas ou reativadas agora (para notificação e webhook depois do commit). */
  novas: string[];
}

/**
 * O ALUNO resgata o código (já normalizado) para si. Recusa (sem gastar uso) se o voucher não vale,
 * se passou de um limite ou se a pessoa já tem acesso valendo a TODOS os cursos dele.
 * Produto que a pessoa já tem valendo entra como "ja-existia", sem referência (não sobrescreve a do gateway).
 */
export async function resgatarVoucher(
  tx: Transacao,
  p: { criadorId: string; membroId: string; usuarioId: string; codigo: string; agora?: Date },
): Promise<ResultadoResgate> {
  const agora = p.agora ?? new Date();
  const [v] = await tx
    .select()
    .from(criadores_vouchers)
    .where(and(eq(criadores_vouchers.criador_id, p.criadorId), eq(criadores_vouchers.codigo, p.codigo), vivos(criadores_vouchers)))
    .for("update");
  if (!v) throw new ErroDeNegocio(MSG_VOUCHER_NAO_ENCONTRADO);

  const contar = (porPessoa: boolean) =>
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(criadores_vouchers_resgates)
      .where(and(eq(criadores_vouchers_resgates.voucher_id, v.id), vivos(criadores_vouchers_resgates), porPessoa ? eq(criadores_vouchers_resgates.membro_id, p.membroId) : undefined));
  const [[usos], [daPessoa]] = await Promise.all([contar(false), contar(true)]);
  const motivo = motivoRecusaResgate(
    { situacao: v.situacao, validoAte: v.valido_ate, limiteUsos: v.limite_usos, limitePorPessoa: v.limite_por_pessoa, usos: usos.n, usosDaPessoa: daPessoa.n },
    agora,
  );
  if (motivo) throw new ErroDeNegocio(TEXTO_RECUSA_RESGATE[motivo]);

  // Só produtos vivos (curso removido depois de criar o voucher sai do resgate).
  const linhas = await tx
    .select({ produtoId: criadores_vouchers_produtos.produto_id })
    .from(criadores_vouchers_produtos)
    .innerJoin(produtos, eq(produtos.id, criadores_vouchers_produtos.produto_id))
    .where(and(eq(criadores_vouchers_produtos.voucher_id, v.id), vivos(criadores_vouchers_produtos), vivos(produtos)))
    .orderBy(criadores_vouchers_produtos.produto_id);
  if (!linhas.length) throw new ErroDeNegocio("Este voucher não libera nenhum curso no momento.");
  const ids = linhas.map((l) => l.produtoId);
  const valendo = new Set(
    (
      await tx
        .select({ produtoId: produtos_matriculas.produto_id })
        .from(produtos_matriculas)
        .where(and(eq(produtos_matriculas.membro_id, p.membroId), inArray(produtos_matriculas.produto_id, ids), vivos(produtos_matriculas), valeAgora(agora)))
    ).map((m) => m.produtoId),
  );
  if (ids.every((id) => valendo.has(id))) throw new ErroDeNegocio("Você já tem acesso a todos os cursos deste voucher.");

  const resgateId = randomUUID();
  const expiraEm = expiracaoDoResgate(v.dias_acesso, agora);
  const matriculas: MatriculaDoResgate[] = [];
  for (const produtoId of ids) {
    const r = await matricular(tx, {
      criadorId: p.criadorId,
      membroId: p.membroId,
      produtoId,
      origem: "VOUCHER",
      expiraEm,
      referenciaExterna: valendo.has(produtoId) ? null : `voucher:${resgateId}:${produtoId}`,
      autor: p.usuarioId,
      agora,
    });
    matriculas.push({ produtoId, matriculaId: r.matriculaId, resultado: r.resultado });
  }
  await tx.insert(criadores_vouchers_resgates).values({ id: resgateId, criador_id: p.criadorId, voucher_id: v.id, membro_id: p.membroId, matriculas, modified_by: p.usuarioId });
  await registrarAuditoria(tx, {
    userId: p.usuarioId,
    criadorId: p.criadorId,
    acao: "criar",
    tabela: "criadores_vouchers_resgates",
    registroId: resgateId,
    detalhes: `Resgatou o voucher ${v.codigo}`,
    dadosNovos: { voucher_id: v.id, membro_id: p.membroId, matriculas },
  });
  return { resgateId, voucherId: v.id, matriculas, novas: matriculas.filter((m) => m.resultado !== "ja-existia").map((m) => m.matriculaId) };
}
