import "server-only";
import { and, asc, desc, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import type { SituacaoVoucher } from "@/lib/db/schema/_enums";
import { criadores_membros, criadores_vouchers as cv, criadores_vouchers_produtos as cvp, criadores_vouchers_resgates as cvr, produtos, usuarios } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { normalizarCodigoVoucher } from "./regras";

/** Leituras da aba "Vouchers" (RN-201). `criadorId` sempre do host; tudo filtra criador e vivos. */

export interface FiltrosVouchers {
  /** Parte do código (sem diferença de caixa/hífen) ou da descrição. */
  busca?: string;
  situacao?: SituacaoVoucher;
}

const curinga = (texto: string) => `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listarVouchers(criadorId: string, f: FiltrosVouchers = {}, agora = new Date()) {
  const condicoes: SQL[] = [eq(cv.criador_id, criadorId), vivos(cv)];
  if (f.situacao) condicoes.push(eq(cv.situacao, f.situacao));
  if (f.busca?.trim()) condicoes.push(sql`(${cv.codigo} like ${curinga(normalizarCodigoVoucher(f.busca))} or ${ilike(cv.descricao, curinga(f.busca.trim()))})`);
  const linhas = await db
    .select({
      id: cv.id,
      codigo: cv.codigo,
      descricao: cv.descricao,
      situacao: cv.situacao,
      validoAte: cv.valido_ate,
      limiteUsos: cv.limite_usos,
      limitePorPessoa: cv.limite_por_pessoa,
      diasAcesso: cv.dias_acesso,
      criadoEm: cv.created_at,
      versao: cv.updated_at,
      usos: sql<number>`(select count(*)::int from criadores_vouchers_resgates r where r.voucher_id = "criadores_vouchers"."id" and r.is_deleted = false)`,
    })
    .from(cv)
    .where(and(...condicoes))
    .orderBy(desc(cv.created_at));
  const prods = linhas.length
    ? await db
        .select({ voucherId: cvp.voucher_id, id: produtos.id, titulo: produtos.titulo })
        .from(cvp)
        .innerJoin(produtos, eq(produtos.id, cvp.produto_id))
        .where(and(inArray(cvp.voucher_id, linhas.map((l) => l.id)), eq(cvp.criador_id, criadorId), vivos(cvp), vivos(produtos)))
        .orderBy(asc(produtos.titulo))
    : [];
  return linhas.map((l) => ({
    ...l,
    /** ATIVO com validade vencida: a tela mostra "Expirado" (a situação gravada não muda sozinha). */
    expirado: l.validoAte !== null && l.validoAte.getTime() <= agora.getTime(),
    produtos: prods.filter((p) => p.voucherId === l.id).map(({ id, titulo }) => ({ id, titulo })),
  }));
}

/** Quem resgatou, quando e o que ganhou (mais recentes primeiro). `null` = voucher não é deste criador. */
export async function resgatesDoVoucher(criadorId: string, voucherId: string, limite = 200) {
  const [v] = await db.select({ id: cv.id }).from(cv).where(and(eq(cv.id, voucherId), eq(cv.criador_id, criadorId), vivos(cv)));
  if (!v) return null;
  return db
    .select({
      id: cvr.id,
      membroId: cvr.membro_id,
      nome: usuarios.nome,
      email: usuarios.email,
      resgatadoEm: cvr.created_at,
      matriculas: cvr.matriculas,
    })
    .from(cvr)
    .innerJoin(criadores_membros, eq(criadores_membros.id, cvr.membro_id))
    .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .where(and(eq(cvr.voucher_id, voucherId), eq(cvr.criador_id, criadorId), vivos(cvr)))
    .orderBy(desc(cvr.created_at))
    .limit(limite);
}
