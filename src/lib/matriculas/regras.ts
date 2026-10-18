import type { OrigemMatricula, StatusMatricula } from "@/lib/db/schema/_enums";

/**
 * Regras PURAS de matricula (RN-116), usadas pela tela e pelo servidor. Travadas por teste.
 *
 * EXPIRADA nao e status gravado: e ATIVA com `expira_em` ja passado. Assim a expiracao vale
 * no instante certo sem job nenhum, e "alterar expiracao" devolve o acesso sem outra escrita.
 */

export const SITUACOES_MATRICULA = ["ATIVA", "PENDENTE", "CANCELADA", "EXPIRADA"] as const;
export type SituacaoMatricula = (typeof SITUACOES_MATRICULA)[number];

export const ROTULO_SITUACAO_MATRICULA: Record<SituacaoMatricula, string> = {
  ATIVA: "Ativa",
  PENDENTE: "Pendente",
  CANCELADA: "Cancelada",
  EXPIRADA: "Expirada",
};

export const ROTULO_ORIGEM_MATRICULA: Record<OrigemMatricula, string> = { MANUAL: "Manual", IMPORTACAO: "Importação", COMPRA: "Compra", VOUCHER: "Voucher" };

export function situacaoDaMatricula(m: { status: StatusMatricula; expiraEm: Date | null }, agora: Date): SituacaoMatricula {
  if (m.status !== "ATIVA") return m.status;
  return m.expiraEm && m.expiraEm.getTime() <= agora.getTime() ? "EXPIRADA" : "ATIVA";
}

/** Da acesso agora? (ATIVA e nao expirada.) */
export const matriculaVale = (m: { status: StatusMatricula; expiraEm: Date | null }, agora: Date) => situacaoDaMatricula(m, agora) === "ATIVA";

/** Brasilia sem horario de verao desde 2019: UTC-3 fixo. */
const OFFSET_BRASILIA_H = 3;

/** "AAAA-MM-DD" ou "DD/MM/AAAA" (planilha brasileira). */
const RE_DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_DATA_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/**
 * Data do calendario -> ultimo milissegundo daquele dia em Brasilia (a matricula vale o dia
 * inteiro). `null` = data inexistente (31/02) ou fora do formato.
 */
export function fimDoDiaEmBrasilia(texto: string): Date | null {
  const iso = RE_DATA_ISO.exec(texto.trim());
  const br = RE_DATA_BR.exec(texto.trim());
  const [ano, mes, dia] = iso ? [iso[1], iso[2], iso[3]].map(Number) : br ? [br[3], br[2], br[1]].map(Number) : [];
  if (!ano || !mes || !dia || ano < 2000 || ano > 2200) return null;
  const meiaNoite = new Date(Date.UTC(ano, mes - 1, dia));
  if (meiaNoite.getUTCFullYear() !== ano || meiaNoite.getUTCMonth() !== mes - 1 || meiaNoite.getUTCDate() !== dia) return null;
  return new Date(Date.UTC(ano, mes - 1, dia + 1, OFFSET_BRASILIA_H) - 1);
}

/** "AAAA-MM-DD" do instante, no calendario de Brasilia (valor do `<input type="date">`). */
export function dataEmBrasilia(d: Date): string {
  return new Date(d.getTime() - OFFSET_BRASILIA_H * 3_600_000).toISOString().slice(0, 10);
}

export const MSG_EXPIRACAO_PASSADA = "A data de expiração precisa ser hoje ou depois.";

/** Expiracao aceita numa matricula nova/alterada: nula (sem expiracao) ou ainda nao passada. */
export const expiracaoValida = (expiraEm: Date | null, agora: Date) => expiraEm === null || expiraEm.getTime() > agora.getTime();
