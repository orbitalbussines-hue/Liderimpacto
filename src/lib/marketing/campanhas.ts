import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db, type Transacao } from "@/lib/db";
import { criadores_campanhas as camp, criadores_emails_envios as envios } from "@/lib/db/schema";
import type { SituacaoCampanha } from "@/lib/db/schema/_enums";
import type { ConteudoMarketing, PublicoCampanha } from "@/lib/db/schema/marketing";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { hashDoDestinatario } from "@/lib/email/disparos";
import { conferirPublico, descadastradosEntre, pessoasDoPublico } from "./publico";
import { MOTIVOS_ENVIO, campanhaCancelavel, campanhaEditavel } from "./regras";

/**
 * CAMPANHAS (RN-220 a RN-222): rascunho → agendada (ou "enviar agora" = agendada para já) → enviando
 * → concluída; cancelada a qualquer momento antes do fim. Escritas da equipe na transação de quem chama
 * (trava por `updated_at`, trilha junto); as do sistema (início, conclusão) não mexem em `updated_at`.
 * O público é lido NO INÍCIO do envio (quem entrou depois do agendamento recebe; quem saiu, não).
 */

const TABELA = "criadores_campanhas";
const AGENDA_MAXIMA_MS = 366 * 86_400_000;

interface Dados {
  nome: string;
  conteudo: ConteudoMarketing;
  publico: PublicoCampanha;
}

export async function criarCampanha(tx: Transacao, p: { criadorId: string; autor: string } & Dados): Promise<{ id: string; versao: Date }> {
  await conferirPublico(tx, p.criadorId, p.publico);
  const [c] = await tx
    .insert(camp)
    .values({ criador_id: p.criadorId, nome: p.nome, conteudo: p.conteudo, publico: p.publico, modified_by: p.autor })
    .returning({ id: camp.id, versao: camp.updated_at });
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "criar", tabela: TABELA, registroId: c.id, detalhes: `Criou a campanha "${p.nome}"`, dadosNovos: { nome: p.nome, assunto: p.conteudo.assunto, publico: p.publico } });
  return c;
}

async function travada(tx: Transacao, criadorId: string, campanhaId: string, versao: Date) {
  const [c] = await tx
    .select({ nome: camp.nome, situacao: camp.situacao, assunto: sql<string>`${camp.conteudo}->>'assunto'`, agendadaPara: camp.agendada_para })
    .from(camp)
    .where(and(travaDeColisao(camp, campanhaId, versao), eq(camp.criador_id, criadorId)))
    .for("update");
  if (!c) throw new ErroDeNegocio(MSG_COLISAO);
  return c;
}

const atualizar = async (tx: Transacao, p: { criadorId: string; autor: string; campanhaId: string; versao: Date }, campos: Partial<typeof camp.$inferInsert>) => {
  const [c] = await tx
    .update(camp)
    .set({ ...campos, updated_at: new Date(), modified_by: p.autor })
    .where(and(travaDeColisao(camp, p.campanhaId, p.versao), eq(camp.criador_id, p.criadorId)))
    .returning({ versao: camp.updated_at });
  if (!c) throw new ErroDeNegocio(MSG_COLISAO);
  return c;
};

export async function salvarCampanha(tx: Transacao, p: { criadorId: string; autor: string; campanhaId: string; versao: Date } & Dados): Promise<{ versao: Date }> {
  const antes = await travada(tx, p.criadorId, p.campanhaId, p.versao);
  if (!campanhaEditavel(antes.situacao)) throw new ErroDeNegocio("Campanha já enviada ou cancelada: não pode mais ser editada.");
  await conferirPublico(tx, p.criadorId, p.publico);
  const c = await atualizar(tx, p, { nome: p.nome, conteudo: p.conteudo, publico: p.publico });
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "atualizar", tabela: TABELA, registroId: p.campanhaId, detalhes: `Editou a campanha "${p.nome}"`, dadosAnteriores: antes, dadosNovos: { nome: p.nome, assunto: p.conteudo.assunto, publico: p.publico } });
  return c;
}

/** `quando` nulo = enviar agora. Devolve o instante (o job da fila `marketing` sai com esse atraso). */
export async function agendarCampanha(tx: Transacao, p: { criadorId: string; autor: string; campanhaId: string; versao: Date; quando: Date | null; agora?: Date }): Promise<{ versao: Date; quando: Date }> {
  const agora = p.agora ?? new Date();
  const antes = await travada(tx, p.criadorId, p.campanhaId, p.versao);
  if (!campanhaEditavel(antes.situacao)) throw new ErroDeNegocio("Campanha já enviada ou cancelada.");
  const quando = p.quando ?? agora;
  if (quando.getTime() < agora.getTime() - 60_000) throw new ErroDeNegocio("Escolha um horário a partir de agora.");
  if (quando.getTime() > agora.getTime() + AGENDA_MAXIMA_MS) throw new ErroDeNegocio("Agende para no máximo um ano à frente.");
  const c = await atualizar(tx, p, { situacao: "AGENDADA", agendada_para: quando });
  await registrarAuditoria(tx, {
    userId: p.autor,
    criadorId: p.criadorId,
    acao: "publicar",
    tabela: TABELA,
    registroId: p.campanhaId,
    detalhes: p.quando ? `Agendou a campanha "${antes.nome}" para ${quando.toISOString()}` : `Mandou enviar agora a campanha "${antes.nome}"`,
    dadosAnteriores: { situacao: antes.situacao, agendada_para: antes.agendadaPara },
    dadosNovos: { situacao: "AGENDADA", agendada_para: quando },
  });
  return { versao: c.versao, quando };
}

/** Cancela antes do fim: os envios que ainda estão na fila não saem (IGNORADO). Ação crítica (modal). */
export async function cancelarCampanha(tx: Transacao, p: { criadorId: string; autor: string; campanhaId: string; versao: Date }): Promise<{ versao: Date; naoEnviados: number }> {
  const antes = await travada(tx, p.criadorId, p.campanhaId, p.versao);
  if (!campanhaCancelavel(antes.situacao)) throw new ErroDeNegocio("Só campanha agendada ou enviando pode ser cancelada.");
  const c = await atualizar(tx, p, { situacao: "CANCELADA", cancelada_em: new Date() });
  const fora = await tx
    .update(envios)
    .set({ situacao: "IGNORADO", motivo: MOTIVOS_ENVIO.CANCELADA })
    .where(and(eq(envios.campanha_id, p.campanhaId), eq(envios.criador_id, p.criadorId), eq(envios.situacao, "PENDENTE")))
    .returning({ id: envios.id });
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "atualizar", tabela: TABELA, registroId: p.campanhaId, detalhes: `Cancelou a campanha "${antes.nome}" (${fora.length} e-mail(s) não enviados)`, dadosAnteriores: { situacao: antes.situacao } });
  return { versao: c.versao, naoEnviados: fora.length };
}

/** Só rascunho se exclui (o que já saiu fica no histórico). */
export async function excluirCampanha(tx: Transacao, p: { criadorId: string; autor: string; campanhaId: string; versao: Date }): Promise<void> {
  const antes = await travada(tx, p.criadorId, p.campanhaId, p.versao);
  if (antes.situacao !== "RASCUNHO") throw new ErroDeNegocio("Só rascunho pode ser excluído. Cancele a campanha.");
  const [c] = await tx.update(camp).set(marcaDeExclusao(p.autor)).where(and(travaDeColisao(camp, p.campanhaId, p.versao), eq(camp.criador_id, p.criadorId))).returning({ id: camp.id });
  if (!c) throw new ErroDeNegocio(MSG_COLISAO);
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "excluir", tabela: TABELA, registroId: p.campanhaId, detalhes: `Excluiu o rascunho "${antes.nome}"`, dadosAnteriores: antes });
}

export type InicioCampanha = { r: "iniciada"; envioIds: string[] } | { r: "cedo"; quando: Date } | { r: "ignorada" };

/**
 * Worker (fila `marketing`): campanha AGENDADA cuja hora chegou → lê o público, cria UM envio por
 * pessoa (`campanha:<id>:<membro>`, idempotente; descadastrado já entra IGNORADO) e passa a ENVIANDO.
 * Devolve os envios a enfileirar. Job velho (reagendada/cancelada) = `ignorada`.
 */
export async function iniciarCampanha(campanhaId: string, agora = new Date()): Promise<InicioCampanha> {
  const r = await db.transaction(async (tx): Promise<InicioCampanha> => {
    const [c] = await tx
      .select({ criadorId: camp.criador_id, publico: camp.publico, situacao: camp.situacao, quando: camp.agendada_para, autor: camp.modified_by })
      .from(camp)
      .where(and(eq(camp.id, campanhaId), vivos(camp)))
      .for("update");
    if (!c || c.situacao !== "AGENDADA" || !c.quando) return { r: "ignorada" };
    if (c.quando.getTime() > agora.getTime() + 5000) return { r: "cedo", quando: c.quando };
    const pessoas = await pessoasDoPublico(c.criadorId, c.publico, agora);
    const fora = await descadastradosEntre(c.criadorId, pessoas.map((x) => hashDoDestinatario(x.email)));
    const ids: string[] = [];
    for (let i = 0; i < pessoas.length; i += 1000) {
      const criados = await tx
        .insert(envios)
        .values(
          pessoas.slice(i, i + 1000).map((x) => {
            const descadastrado = fora.has(hashDoDestinatario(x.email));
            return {
              criador_id: c.criadorId,
              membro_id: x.membroId,
              origem: "CAMPANHA" as const,
              campanha_id: campanhaId,
              chave: `campanha:${campanhaId}:${x.membroId}`,
              situacao: descadastrado ? ("IGNORADO" as const) : ("PENDENTE" as const),
              motivo: descadastrado ? MOTIVOS_ENVIO.DESCADASTRADO : null,
              modified_by: c.autor,
            };
          }),
        )
        .onConflictDoNothing()
        .returning({ id: envios.id, situacao: envios.situacao });
      ids.push(...criados.filter((x) => x.situacao === "PENDENTE").map((x) => x.id));
    }
    await tx.update(camp).set({ situacao: "ENVIANDO", iniciada_em: agora, total_destinatarios: pessoas.length }).where(eq(camp.id, campanhaId));
    return { r: "iniciada", envioIds: ids };
  });
  if (r.r === "iniciada" && !r.envioIds.length) await concluirCampanhaSeTerminou(campanhaId);
  return r;
}

/** ENVIANDO sem nenhum envio na fila → CONCLUIDA (chamado a cada baixa de envio). */
export async function concluirCampanhaSeTerminou(campanhaId: string): Promise<boolean> {
  const r = await db
    .update(camp)
    .set({ situacao: "CONCLUIDA", concluida_em: new Date() })
    .where(and(eq(camp.id, campanhaId), eq(camp.situacao, "ENVIANDO"), sql`not exists (select 1 from criadores_emails_envios e where e.campanha_id = ${campanhaId} and e.situacao = 'PENDENTE')`))
    .returning({ id: camp.id });
  return r.length > 0;
}

/** AGENDADAS (fila fora do ar no agendamento): o worker reenfileira ao subir. */
export async function campanhasAgendadas(): Promise<{ id: string; quando: Date }[]> {
  const linhas = await db.select({ id: camp.id, quando: camp.agendada_para }).from(camp).where(and(eq(camp.situacao, "AGENDADA" satisfies SituacaoCampanha), vivos(camp)));
  return linhas.flatMap((l) => (l.quando ? [{ id: l.id, quando: l.quando }] : []));
}
