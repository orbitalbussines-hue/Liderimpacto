import { ZodError } from "zod";

/**
 * Retorno padrao de Server Action que muta dados. Em producao o Next esconde a
 * mensagem de qualquer erro lancado numa action — por isso erro ESPERADO
 * (colisao, validacao, permissao) volta como valor, nao como throw.
 */
export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string };

/** Erro esperado, com mensagem segura para mostrar na tela. */
export class ErroDeNegocio extends Error {}

/** Roda o corpo da action e converte o erro em `Resultado`. */
export async function executar<T>(corpo: () => Promise<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, dados: await corpo() };
  } catch (e) {
    if (e instanceof ErroDeNegocio) return { ok: false, erro: e.message };
    if (e instanceof ZodError) return { ok: false, erro: e.issues[0]?.message ?? "Dados invalidos." };
    console.error(e); // erro inesperado: detalhe so no log do servidor
    return { ok: false, erro: "Falha inesperada. Tente novamente." };
  }
}
