import "server-only";
import type { PapelCriador } from "@/lib/db/schema/_enums";
import { acessoDaAula } from "@/lib/video/acesso-aula";
import { registrarProgresso, type ProgressoGravado } from "./registrar";
import { esquemaBatida, INTERVALO_MINIMO_BATIDA_MS } from "./regras";

/**
 * Porta ÚNICA da batida do player: a action (uso normal) e o `POST /api/progresso` (beacon)
 * chamam isto depois de resolver a sessão do HOST. Ordem: valida o corpo (Zod: lança) →
 * limite por sessão+aula → `acessoDaAula` (só quem pode assistir registra) → upsert.
 */

export interface QuemBate {
  criadorId: string;
  /** Nulo = SUPER_ADMIN sem vínculo (suporte): não tem progresso próprio. */
  membroId: string | null;
  usuarioId: string;
  papel: PapelCriador | null;
  /** Sessão de login: chave do limite de frequência. */
  sessaoId: string;
}

export type ResultadoBatida =
  | { situacao: "registrada"; progresso: ProgressoGravado }
  /** Limite de frequência, aula sem duração ou declarou mais do que o tempo real permite. */
  | { situacao: "ignorada" }
  | { situacao: "recusada"; motivo: "sem-acesso" | "nao-encontrada" };

// ponytail: limite em memória POR PROCESSO (cada instância conta o seu). É só para poupar o
// banco de batidas repetidas; o teto real (segundos declarados x tempo decorrido) está no upsert,
// no banco. Mover para Redis se houver várias instâncias atrás do balanceador.
const ultimaBatida = new Map<string, number>();
const LIMPAR_ACIMA_DE = 10_000;

/** `true` = passou do intervalo mínimo (e marca agora). Exportada para o teste. */
export function dentroDoLimite(chave: string, agoraMs = Date.now()): boolean {
  const anterior = ultimaBatida.get(chave);
  if (anterior !== undefined && agoraMs - anterior < INTERVALO_MINIMO_BATIDA_MS) return false;
  if (ultimaBatida.size > LIMPAR_ACIMA_DE) {
    for (const [k, t] of ultimaBatida) if (agoraMs - t >= INTERVALO_MINIMO_BATIDA_MS) ultimaBatida.delete(k);
  }
  ultimaBatida.set(chave, agoraMs);
  return true;
}

export async function receberBatida(quem: QuemBate, entrada: unknown): Promise<ResultadoBatida> {
  const b = esquemaBatida.parse(entrada);
  if (!quem.membroId) return { situacao: "ignorada" };
  if (!dentroDoLimite(`${quem.sessaoId}:${b.aulaId}`)) return { situacao: "ignorada" };
  const acesso = await acessoDaAula(quem.criadorId, b.aulaId, { papel: quem.papel, membroId: quem.membroId });
  if (!acesso) return { situacao: "recusada", motivo: "nao-encontrada" };
  if (!acesso.pode) return { situacao: "recusada", motivo: "sem-acesso" };
  const progresso = await registrarProgresso({
    criadorId: quem.criadorId,
    membroId: quem.membroId,
    usuarioId: quem.usuarioId,
    aulaId: b.aulaId,
    intervalos: b.intervalos,
    posicao: b.posicao,
    duracaoSeg: b.duracaoSeg,
  });
  return progresso ? { situacao: "registrada", progresso } : { situacao: "ignorada" };
}
