import "server-only";
import { enfileirarReindexacao, filaConhecimento } from "./fila";
import { sincronizar, type AlvoIndexacao } from "./indexar";

const PRAZO_ENFILEIRAR_MS = 3000;

/**
 * Pede a reindexação de uma fonte DEPOIS do commit de quem mudou (legenda, aula, curso). Nunca
 * derruba a ação: fila fora do ar = indexa aqui mesmo; isso também falhou = só o log (o script
 * `npm run conhecimento:reindexar -- <slug>` conserta tudo de uma vez, idempotente).
 */
export async function pedirReindexacao(criadorId: string, alvo: AlvoIndexacao, autorId: string): Promise<"fila" | "agora" | "falhou"> {
  try {
    await Promise.race([
      enfileirarReindexacao(filaConhecimento(), { criadorId, autorId, alvo }),
      new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error("fila não respondeu")), PRAZO_ENFILEIRAR_MS)),
    ]);
    return "fila";
  } catch (e) {
    console.error("[conhecimento] fila indisponível, indexando na hora:", e instanceof Error ? e.message : e);
  }
  try {
    await sincronizar(criadorId, alvo, autorId);
    return "agora";
  } catch (e) {
    console.error("CRITICAL [conhecimento] reindexação falhou (rode conhecimento:reindexar):", alvo, e);
    return "falhou";
  }
}
