import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { registrarAuditoria } from "@/lib/audit/registrar";
import type { Transacao } from "@/lib/db";
import { produtos_matriculas as pm } from "@/lib/db/schema";
import type { MatriculaDaVenda } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { matriculaVale } from "@/lib/matriculas/regras";
import { matricular } from "@/lib/matriculas/servico";

/**
 * Acesso liberado por compra (RN-215, RN-216), sempre pelo `matricular` (origem COMPRA, autor =
 * sistema). Regras:
 *  - quem já tem acesso VITALÍCIO valendo fica como está e sem referência (reembolso desta venda não
 *    tira o que veio de outro lugar);
 *  - senão, matricula com a referência estável (`stripe:<venda|assinatura>:<produto>`) e, se a
 *    matrícula já valia com prazo menor, ESTENDE até o novo prazo (nunca encurta);
 *  - referência já usada e matrícula cancelada (reembolso anterior + nova cobrança): reativa.
 */
export async function concederAcesso(
  tx: Transacao,
  p: { criadorId: string; membroId: string; produtoId: string; ate: Date | null; referencia: string; agora: Date },
): Promise<MatriculaDaVenda> {
  const [atual] = await tx
    .select()
    .from(pm)
    .where(and(eq(pm.criador_id, p.criadorId), eq(pm.membro_id, p.membroId), eq(pm.produto_id, p.produtoId), vivos(pm)));
  const vale = !!atual && matriculaVale({ status: atual.status, expiraEm: atual.expira_em }, p.agora);
  if (atual && vale && atual.expira_em === null) return { produtoId: p.produtoId, matriculaId: atual.id, resultado: "ja-existia" };

  const jaTemEstaReferencia = atual?.referencia_externa === p.referencia;
  const r = await matricular(tx, {
    criadorId: p.criadorId,
    membroId: p.membroId,
    produtoId: p.produtoId,
    origem: "COMPRA",
    expiraEm: p.ate,
    referenciaExterna: jaTemEstaReferencia && !vale ? null : p.referencia,
    autor: null,
    agora: p.agora,
  });
  if (r.resultado === "ja-existia") {
    const [m] = await tx.select().from(pm).where(eq(pm.id, r.matriculaId)).for("update");
    if (m.expira_em !== null && (p.ate === null || p.ate.getTime() > m.expira_em.getTime())) {
      await registrarAuditoria(tx, {
        userId: null,
        criadorId: p.criadorId,
        acao: "atualizar",
        tabela: "produtos_matriculas",
        registroId: m.id,
        detalhes: `Compra estendeu o acesso (${p.referencia})`,
        dadosAnteriores: { expira_em: m.expira_em.toISOString() },
        dadosNovos: { expira_em: p.ate?.toISOString() ?? null },
      });
      // Atualização de sistema (como a referência no `matricular`): `updated_at` anda junto (trava da tela).
      await tx.update(pm).set({ expira_em: p.ate, updated_at: p.agora, modified_by: m.modified_by }).where(eq(pm.id, m.id));
    }
  }
  return { produtoId: p.produtoId, matriculaId: r.matriculaId, resultado: r.resultado };
}

/**
 * Corta o acesso liberado por uma venda/assinatura: cancela as matrículas vivas cuja referência começa
 * com o prefixo (`stripe:<id>:`) e ainda não estão canceladas. Devolve os ids (webhook de saída
 * MATRICULA_CANCELADA depois do commit).
 */
export async function encerrarAcesso(tx: Transacao, p: { criadorId: string; prefixo: string; motivo: string; agora: Date }): Promise<string[]> {
  const linhas = await tx
    .select({ id: pm.id, status: pm.status, referencia: pm.referencia_externa, modifiedBy: pm.modified_by })
    .from(pm)
    .where(and(eq(pm.criador_id, p.criadorId), sql`starts_with(${pm.referencia_externa}, ${p.prefixo})`, ne(pm.status, "CANCELADA"), vivos(pm)))
    .for("update");
  for (const l of linhas) {
    await registrarAuditoria(tx, {
      userId: null,
      criadorId: p.criadorId,
      acao: "atualizar",
      tabela: "produtos_matriculas",
      registroId: l.id,
      detalhes: `Acesso encerrado: ${p.motivo} (${l.referencia})`,
      dadosAnteriores: { status: l.status },
      dadosNovos: { status: "CANCELADA", motivo_cancelamento: p.motivo },
    });
    await tx.update(pm).set({ status: "CANCELADA", motivo_cancelamento: p.motivo, updated_at: p.agora, modified_by: l.modifiedBy }).where(eq(pm.id, l.id));
  }
  return linhas.map((l) => l.id);
}
