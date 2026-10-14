// Sem o marcador "server-only": o modulo e usado por servicos que os testes importam direto.
import { after } from "next/server";

/**
 * Escrita que nao pode atrasar a resposta: contadores e trilha das RECUSAS de login, envio
 * de e-mail. Gravadas depois de a resposta sair, "existe" e "nao existe" custam o mesmo
 * tempo (docs/seguranca-login.md, recusa unica tambem no tempo).
 * Fora de uma requisicao (teste, script) grava na hora.
 */
export async function depoisDaResposta(tarefa: () => Promise<unknown>): Promise<void> {
  const segura = () => tarefa().catch((erro) => console.error("[auth] escrita adiada falhou:", erro instanceof Error ? erro.message : erro));
  try {
    after(segura);
  } catch {
    await segura();
  }
}
