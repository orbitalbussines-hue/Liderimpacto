/**
 * Vouchers (RN-201) — PURO: alfabeto do código, normalização e o motivo de recusa do resgate.
 * Serve ao servidor e à tela (a tela mostra o código formatado e valida antes de enviar).
 */
import type { SituacaoVoucher } from "@/lib/db/schema/_enums";

/** Web Crypto: existe no Node e no navegador (este módulo também vai para a tela). */
const aleatorios = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** 32 símbolos SEM 0/O/1/I: ninguém confunde ao ditar ou digitar. 32 = sem viés no `& 31`. */
export const ALFABETO_VOUCHER = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Mesmo formato do CHECK do banco. */
export const RE_CODIGO_VOUCHER = /^[A-HJ-NP-Z2-9]{6,16}$/;
export const TAMANHO_CODIGO_GERADO = 8;

export function gerarCodigoVoucher(tamanho = TAMANHO_CODIGO_GERADO, bytes: (n: number) => Uint8Array = aleatorios): string {
  return [...bytes(tamanho)].map((b) => ALFABETO_VOUCHER[b & 31]).join("");
}

/** O que a pessoa digitou → forma guardada: maiúsculas, sem espaço nem hífen. Não "corrige" 0/O. */
export const normalizarCodigoVoucher = (texto: string) => texto.toUpperCase().replace(/[\s-]+/g, "");

/** Exibição: grupos de 4 (`ABCD-EFGH`). */
export const formatarCodigoVoucher = (codigo: string) => codigo.match(/.{1,4}/g)?.join("-") ?? codigo;

export interface EstadoResgate {
  situacao: SituacaoVoucher;
  validoAte: Date | null;
  limiteUsos: number | null;
  limitePorPessoa: number;
  usos: number;
  usosDaPessoa: number;
}

export type MotivoRecusaResgate = "PAUSADO" | "ENCERRADO" | "EXPIRADO" | "ESGOTADO" | "LIMITE_PESSOA";

export const TEXTO_RECUSA_RESGATE: Record<MotivoRecusaResgate, string> = {
  PAUSADO: "Este voucher está pausado no momento.",
  ENCERRADO: "Este voucher foi encerrado.",
  EXPIRADO: "Este voucher expirou.",
  ESGOTADO: "Este voucher já atingiu o limite de usos.",
  LIMITE_PESSOA: "Você já usou este voucher o máximo de vezes permitido.",
};

export function motivoRecusaResgate(e: EstadoResgate, agora: Date): MotivoRecusaResgate | null {
  if (e.situacao === "ENCERRADO") return "ENCERRADO";
  if (e.situacao === "PAUSADO") return "PAUSADO";
  if (e.validoAte && e.validoAte.getTime() <= agora.getTime()) return "EXPIRADO";
  if (e.limiteUsos !== null && e.usos >= e.limiteUsos) return "ESGOTADO";
  if (e.usosDaPessoa >= e.limitePorPessoa) return "LIMITE_PESSOA";
  return null;
}

/** ENCERRADO é final (o código deixa de valer para sempre); ATIVO ⇄ PAUSADO. */
export const transicaoVoucherValida = (de: SituacaoVoucher, para: SituacaoVoucher) => de !== "ENCERRADO" && de !== para;

/** Expiração da matrícula gerada: `dias` a partir de agora; nulo = sem expiração. */
export const expiracaoDoResgate = (diasAcesso: number | null, agora: Date) => (diasAcesso === null ? null : new Date(agora.getTime() + diasAcesso * 86_400_000));
