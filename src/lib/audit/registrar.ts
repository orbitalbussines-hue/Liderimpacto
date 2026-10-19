import { db, type Transacao } from "@/lib/db";
import { auditoria } from "@/lib/db/schema/auditoria";

export type AcaoAuditada =
  | "criar"
  | "atualizar"
  | "excluir"
  | "publicar"
  | "reordenar"
  | "login"
  | "login_recusado"
  | "conta_bloqueada"
  | "logout"
  | "acesso_negado"
  | "senha"
  | "segundo_fator"
  | "reproduzir"
  | "exportar";

interface RegistroDeAuditoria {
  /** `null` = evento ANONIMO (e-mail inexistente, teto de IP estourado): nao ha conta. */
  userId: string | null;
  /** Area do evento; nulo/ausente = plataforma. */
  criadorId?: string | null;
  acao: AcaoAuditada;
  tabela: string;
  registroId: string | null;
  detalhes: string;
  dadosAnteriores?: unknown;
  dadosNovos?: unknown;
}

/**
 * Grava a trilha DENTRO da transacao da mutacao: ou as duas coisas acontecem, ou nenhuma.
 * `db` direto so para evento sem mutacao junto (login, recusa de acesso).
 * NUNCA registre senha, hash, token, OTP, semente TOTP ou codigo de recuperacao.
 */
export async function registrarAuditoria(tx: Transacao | typeof db, r: RegistroDeAuditoria) {
  await tx.insert(auditoria).values({
    user_id: r.userId,
    criador_id: r.criadorId ?? null,
    acao: r.acao,
    tabela: r.tabela,
    registro_id: r.registroId,
    detalhes: r.detalhes,
    dados_anteriores: r.dadosAnteriores ?? null,
    dados_novos: r.dadosNovos ?? null,
  });
}

/** Teto de espera da gravacao best-effort: a trilha nao pode segurar a resposta. */
const TETO_TRILHA_MS = 3000;

/**
 * Trilha BEST-EFFORT (entrada, saida, recusa): nunca lanca, nunca espera mais que o teto e,
 * se falhar, grita CRITICAL no log. Concessao de poder e mudanca de dado continuam na
 * transacao, com `registrarAuditoria`: ali a trilha e fail-closed de proposito.
 */
export async function registrarAuditoriaSegura(r: RegistroDeAuditoria): Promise<void> {
  try {
    await Promise.race([
      registrarAuditoria(db, r),
      new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error(`trilha demorou mais de ${TETO_TRILHA_MS} ms`)), TETO_TRILHA_MS)),
    ]);
  } catch (erro) {
    // Detalhe (SQL e parametros) so no log do servidor.
    console.error("CRITICAL [trilha] falha ao gravar:", r.acao, erro);
  }
}
