import "server-only";
import { and, eq, gt, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db, type Transacao } from "@/lib/db";
import type { PlataformaIntegracao, SituacaoEventoIntegracao, TipoEventoIntegracao } from "@/lib/db/schema/_enums";
import {
  criadores_integracoes as integ,
  criadores_integracoes_eventos as ev,
  criadores_integracoes_produtos as mapa,
  integracoes_recibos as recibos,
  produtos,
  produtos_matriculas as pm,
  type MatriculaDaVenda,
} from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { vincularPessoa } from "@/lib/membros/vinculos";
import { concederAcesso, encerrarAcesso } from "@/lib/pagamentos/acesso";
import { depoisDaVenda } from "@/lib/pagamentos/processar";
import { webhookMatriculas } from "@/lib/webhooks/emitir";
import { acessoAte, chaveDoAcesso, referenciaDoAcesso, ROTULO_PLATAFORMA, ROTULO_TIPO_EVENTO } from "./regras";

/**
 * Worker das integrações (8º Worker de `worker:certificados`, ADR-0021 item 4). Lê a linha PENDENTE com
 * trava, aplica pelo `matricular` (origem COMPRA, autor = sistema, referência estável) e grava o
 * resultado. Idempotente: a mesma compra duas vezes cai na mesma referência (1 matrícula). Efeitos
 * (notificação, webhook de saída, primeiro acesso) só DEPOIS do commit e sem lançar.
 */

const TABELA = "criadores_integracoes_eventos";
const ENCERRA: readonly TipoEventoIntegracao[] = ["REEMBOLSO", "CHARGEBACK", "CANCELAMENTO"];

interface Linha {
  id: string;
  criadorId: string;
  situacao: SituacaoEventoIntegracao;
  email: string | null;
  nome: string | null;
  proximaCobranca: Date | null;
  integracaoId: string;
  plataforma: PlataformaIntegracao;
  integracaoViva: boolean;
  tipo: TipoEventoIntegracao | null;
  transacao: string | null;
  assinatura: string | null;
  produtoExterno: string | null;
  ocorridoEm: Date | null;
}

interface Desfecho {
  situacao: Exclude<SituacaoEventoIntegracao, "PENDENTE">;
  nota: string | null;
  membroId?: string;
  matriculas?: MatriculaDaVenda[];
  depois?: () => Promise<unknown>;
}

/** Limita o acesso (assinatura cancelada com período pago ainda correndo): nunca estende. */
async function limitarAcesso(tx: Transacao, p: { criadorId: string; prefixo: string; ate: Date; motivo: string; agora: Date }) {
  const linhas = await tx
    .select({ id: pm.id, expiraEm: pm.expira_em, modifiedBy: pm.modified_by })
    .from(pm)
    .where(and(eq(pm.criador_id, p.criadorId), sql`starts_with(${pm.referencia_externa}, ${p.prefixo})`, ne(pm.status, "CANCELADA"), vivos(pm)))
    .for("update");
  for (const l of linhas.filter((l) => l.expiraEm === null || l.expiraEm.getTime() > p.ate.getTime())) {
    await registrarAuditoria(tx, {
      userId: null,
      criadorId: p.criadorId,
      acao: "atualizar",
      tabela: "produtos_matriculas",
      registroId: l.id,
      detalhes: `Acesso limitado ao fim do período pago: ${p.motivo}`,
      dadosAnteriores: { expira_em: l.expiraEm?.toISOString() ?? null },
      dadosNovos: { expira_em: p.ate.toISOString() },
    });
    await tx.update(pm).set({ expira_em: p.ate, updated_at: p.agora, modified_by: l.modifiedBy }).where(eq(pm.id, l.id));
  }
}

/** Recibo já recebido que torna esta aprovação velha (reembolso/cancelamento da mesma compra, ou assinatura cancelada depois). */
async function aprovacaoVencida(tx: Transacao, l: Linha): Promise<boolean> {
  if (l.transacao) {
    const [r] = await tx
      .select({ id: recibos.id })
      .from(recibos)
      .where(and(eq(recibos.integracao_id, l.integracaoId), eq(recibos.transacao, l.transacao), inArray(recibos.tipo, [...ENCERRA])))
      .limit(1);
    if (r) return true;
  }
  if (l.assinatura && l.ocorridoEm) {
    const [r] = await tx
      .select({ id: recibos.id })
      .from(recibos)
      .where(and(eq(recibos.integracao_id, l.integracaoId), eq(recibos.assinatura, l.assinatura), eq(recibos.tipo, "ASSINATURA_CANCELADA"), gt(recibos.ocorrido_em, l.ocorridoEm)))
      .limit(1);
    if (r) return true;
  }
  return false;
}

async function aprovar(tx: Transacao, l: Linha, agora: Date): Promise<Desfecho> {
  const chave = chaveDoAcesso(l.plataforma, l);
  if (!chave) return { situacao: "ERRO", nota: "Evento sem id da transação." };
  if (await aprovacaoVencida(tx, l)) return { situacao: "IGNORADO", nota: "A compra já foi reembolsada ou cancelada." };
  if (!l.produtoExterno) return { situacao: "ERRO", nota: "Evento sem id do produto." };
  const cursos = await tx
    .select({ produtoId: mapa.produto_id, diasAcesso: mapa.dias_acesso })
    .from(mapa)
    .innerJoin(produtos, eq(produtos.id, mapa.produto_id))
    .where(and(eq(mapa.integracao_id, l.integracaoId), eq(mapa.produto_externo, l.produtoExterno), vivos(mapa), vivos(produtos)))
    .orderBy(mapa.produto_id);
  if (cursos.length === 0) return { situacao: "SEM_MAPEAMENTO", nota: `Produto ${l.produtoExterno} sem curso mapeado.` };
  if (!l.email) return { situacao: "ERRO", nota: "Evento sem e-mail do comprador." };

  const v = await vincularPessoa(tx, { criadorId: l.criadorId, autorId: null, nome: l.nome ?? "Aluno", email: l.email, papel: "ALUNO" });
  const matriculas: MatriculaDaVenda[] = [];
  for (const c of cursos) {
    const ate = acessoAte({ proximaCobranca: l.proximaCobranca, diasAcesso: c.diasAcesso }, agora);
    matriculas.push(await concederAcesso(tx, { criadorId: l.criadorId, membroId: v.membroId, produtoId: c.produtoId, ate, referencia: referenciaDoAcesso(chave, c.produtoId), agora }));
  }
  const r = {
    novas: matriculas.filter((m) => m.resultado !== "ja-existia").map((m) => m.matriculaId),
    membroId: v.membroId,
    membroNovo: v.tipo === "vinculado",
    contaNova: v.tipo === "vinculado" && v.identidadeNova ? { usuarioId: v.usuarioId, email: l.email, nome: l.nome ?? "Aluno" } : null,
  };
  return { situacao: "PROCESSADO", nota: null, membroId: v.membroId, matriculas, depois: () => depoisDaVenda(l.criadorId, r) };
}

/** Reembolso/chargeback/cancelamento: assinatura (do evento ou da aprovação da mesma transação) ou a transação. */
async function encerrar(tx: Transacao, l: Linha, agora: Date): Promise<Desfecho> {
  let assinatura = l.assinatura;
  if (!assinatura && l.transacao) {
    const [a] = await tx
      .select({ assinatura: recibos.assinatura })
      .from(recibos)
      .where(and(eq(recibos.integracao_id, l.integracaoId), eq(recibos.transacao, l.transacao), isNotNull(recibos.assinatura)))
      .limit(1);
    assinatura = a?.assinatura ?? null;
  }
  const chave = chaveDoAcesso(l.plataforma, { transacao: l.transacao, assinatura });
  if (!chave) return { situacao: "ERRO", nota: "Evento sem id da transação." };
  const motivo = `${ROTULO_TIPO_EVENTO[l.tipo!]} na ${ROTULO_PLATAFORMA[l.plataforma]}`;
  const encerradas = await encerrarAcesso(tx, { criadorId: l.criadorId, prefixo: `${chave}:`, motivo, agora });
  return { situacao: "PROCESSADO", nota: `${encerradas.length} matrícula(s) encerrada(s).`, depois: () => webhookMatriculas(l.criadorId, encerradas, "MATRICULA_CANCELADA", null) };
}

async function cancelarAssinatura(tx: Transacao, l: Linha, agora: Date): Promise<Desfecho> {
  const chave = chaveDoAcesso(l.plataforma, { transacao: null, assinatura: l.assinatura });
  if (!chave) return { situacao: "ERRO", nota: "Evento sem código da assinatura." };
  const motivo = `Assinatura cancelada na ${ROTULO_PLATAFORMA[l.plataforma]}`;
  // Período pago ainda correndo (a Hotmart manda a data da cobrança que não vai acontecer): vale até lá.
  if (l.proximaCobranca && l.proximaCobranca.getTime() > agora.getTime()) {
    await limitarAcesso(tx, { criadorId: l.criadorId, prefixo: `${chave}:`, ate: l.proximaCobranca, motivo, agora });
    return { situacao: "PROCESSADO", nota: "Acesso vale até o fim do período pago." };
  }
  const encerradas = await encerrarAcesso(tx, { criadorId: l.criadorId, prefixo: `${chave}:`, motivo, agora });
  return { situacao: "PROCESSADO", nota: `${encerradas.length} matrícula(s) encerrada(s).`, depois: () => webhookMatriculas(l.criadorId, encerradas, "MATRICULA_CANCELADA", null) };
}

async function decidir(tx: Transacao, l: Linha, agora: Date): Promise<Desfecho> {
  if (!l.integracaoViva) return { situacao: "IGNORADO", nota: "Integração desconectada." };
  switch (l.tipo) {
    case "COMPRA_APROVADA":
      return aprovar(tx, l, agora);
    case "REEMBOLSO":
    case "CHARGEBACK":
    case "CANCELAMENTO":
      return encerrar(tx, l, agora);
    case "ASSINATURA_CANCELADA":
      return cancelarAssinatura(tx, l, agora);
    case "ASSINATURA_ATRASADA":
      return { situacao: "IGNORADO", nota: "Cobrança atrasada: o acesso vence sozinho no fim do período pago + 3 dias." };
    default:
      return { situacao: "IGNORADO", nota: null };
  }
}

async function gravar(tx: Transacao, l: Linha, d: Desfecho, agora: Date) {
  // Comprador só fica enquanto o evento pode ser reprocessado (SEM_MAPEAMENTO, ERRO).
  const limpa = d.situacao === "PROCESSADO" || d.situacao === "IGNORADO";
  await tx
    .update(ev)
    .set({
      situacao: d.situacao,
      erro: d.nota?.slice(0, 300) ?? null,
      membro_id: d.membroId ?? null,
      matriculas: d.matriculas ?? null,
      processado_em: agora,
      ...(limpa ? { comprador_email: null, comprador_nome: null } : {}),
      updated_at: agora,
    })
    .where(eq(ev.id, l.id));
  await registrarAuditoria(tx, {
    userId: null,
    criadorId: l.criadorId,
    acao: "atualizar",
    tabela: TABELA,
    registroId: l.id,
    detalhes: `${ROTULO_PLATAFORMA[l.plataforma]}: ${l.tipo ? ROTULO_TIPO_EVENTO[l.tipo] : "evento"} (${l.transacao ?? l.assinatura ?? "sem id"}) → ${d.situacao}${d.nota ? ` · ${d.nota}` : ""}`,
    dadosAnteriores: { situacao: l.situacao },
    dadosNovos: { situacao: d.situacao, matriculas: d.matriculas ?? null },
  });
}

async function linhaTravada(tx: Transacao, eventoId: string): Promise<Linha | undefined> {
  const [l] = await tx
    .select({
      id: ev.id,
      criadorId: ev.criador_id,
      situacao: ev.situacao,
      email: ev.comprador_email,
      nome: ev.comprador_nome,
      proximaCobranca: ev.proxima_cobranca,
      integracaoId: recibos.integracao_id,
      plataforma: recibos.plataforma,
      integracaoApagada: integ.is_deleted,
      tipo: recibos.tipo,
      transacao: recibos.transacao,
      assinatura: recibos.assinatura,
      produtoExterno: recibos.produto_externo,
      ocorridoEm: recibos.ocorrido_em,
    })
    .from(ev)
    .innerJoin(recibos, eq(recibos.id, ev.recibo_id))
    .innerJoin(integ, eq(integ.id, recibos.integracao_id))
    .where(and(eq(ev.id, eventoId), vivos(ev)))
    .for("update", { of: ev });
  return l && { ...l, integracaoViva: !l.integracaoApagada };
}

export type ResultadoIntegracao = SituacaoEventoIntegracao | "nada";

/**
 * Processa um evento PENDENTE. Falha inesperada LANÇA (a fila tenta de novo) até a última tentativa,
 * quando vira ERRO; erro de negócio vira ERRO na hora. Em ambos o dono pode reprocessar.
 */
export async function processarEventoIntegracao(eventoId: string, tentativa = 1, maxTentativas = 1, agora: () => Date = () => new Date()): Promise<ResultadoIntegracao> {
  try {
    const r = await db.transaction(async (tx) => {
      const l = await linhaTravada(tx, eventoId);
      if (!l || l.situacao !== "PENDENTE") return null;
      const quando = agora();
      const d = await decidir(tx, l, quando);
      await gravar(tx, l, d, quando);
      return d;
    });
    if (!r) return "nada";
    await r.depois?.();
    return r.situacao;
  } catch (e) {
    const negocio = e instanceof ErroDeNegocio;
    if (!negocio && tentativa < maxTentativas) throw e;
    const nota = negocio ? e.message : "Falha ao processar. Tente reprocessar.";
    console.error("[integracoes] evento com erro:", eventoId, e instanceof Error ? e.name : "erro");
    await db
      .update(ev)
      .set({ situacao: "ERRO", erro: nota.slice(0, 300), updated_at: new Date() })
      .where(and(eq(ev.id, eventoId), eq(ev.situacao, "PENDENTE")));
    return "ERRO";
  }
}

/** Linhas PENDENTES (fila fora do ar quando chegaram): o worker reenfileira ao subir. */
export async function eventosPendentes(limite = 1000): Promise<string[]> {
  const linhas = await db.select({ id: ev.id }).from(ev).where(and(eq(ev.situacao, "PENDENTE"), vivos(ev))).orderBy(ev.created_at).limit(limite);
  return linhas.map((l) => l.id);
}
