import "server-only";
import { MSG_SENHA_VAZADA, problemaNaSenha, senhaVazada } from "@/lib/validators/senha";
import { MSG_SENHA_REPETIDA, senhaRepetida } from "./historico-senha";

/**
 * Portao UNICO da politica de senha no servidor: regras puras (`problemaNaSenha`) +
 * historico (sem reuso das ultimas) + vazamento conhecido (HIBP, k-anonimato).
 * Devolve a mensagem de recusa, ou `null` se a senha passa.
 *
 * FAIL-OPEN na consulta de vazamento: rede fora nao pode impedir alguem de definir a senha;
 * a indisponibilidade fica no log do servidor.
 */
export async function recusaDaPolitica(
  senha: string,
  contexto: { email?: string; nome?: string; usuarioId?: string } = {},
): Promise<string | null> {
  const problema = problemaNaSenha(senha, contexto);
  if (problema) return problema;
  // Reuso: fail-closed de proposito — sem conseguir ler o historico, nao troca.
  if (contexto.usuarioId && (await senhaRepetida(contexto.usuarioId, senha))) return MSG_SENHA_REPETIDA;
  const vazada = await senhaVazada(senha);
  if (vazada === null) {
    console.warn("[auth] checagem de senha vazada indisponível: senha aceita sem essa verificação");
    return null;
  }
  return vazada ? MSG_SENHA_VAZADA : null;
}
