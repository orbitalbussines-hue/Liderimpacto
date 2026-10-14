/**
 * Limite de telas simultâneas (RN-115), parte PURA: o que conta como sessão viva e quais
 * sessões encerrar quando uma nova abre. O banco fica em `reproducao.ts`.
 */

/** O player renova o token (e o sinal) a cada ~4 min; 6 min sem sinal = sessão morta. */
export const JANELA_SESSAO_MS = 6 * 60_000;
export const LIMITE_SESSOES_PADRAO = 2;

/** `VIDEO_LIMITE_SESSOES` (1..10); fora disso vale o padrão. */
export function limiteDeSessoes(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.VIDEO_LIMITE_SESSOES);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : LIMITE_SESSOES_PADRAO;
}

export const sessaoViva = (s: { encerrada_em: Date | null; ultimo_sinal_em: Date }, agora: Date) =>
  s.encerrada_em === null && agora.getTime() - s.ultimo_sinal_em.getTime() < JANELA_SESSAO_MS;

/**
 * Ao abrir uma sessão NOVA: ids das vivas a encerrar para caber no limite (as de sinal mais
 * antigo saem primeiro). A tela nova sempre entra; a mais velha perde a chave na renovação.
 */
export function sessoesAEncerrar(vivas: readonly { id: string; ultimo_sinal_em: Date }[], limite: number): string[] {
  const excesso = vivas.length - (limite - 1);
  if (excesso <= 0) return [];
  return [...vivas]
    .sort((a, b) => a.ultimo_sinal_em.getTime() - b.ultimo_sinal_em.getTime())
    .slice(0, excesso)
    .map((s) => s.id);
}
