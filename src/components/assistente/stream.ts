import type { FonteMensagem } from "@/lib/db/schema/assistente";

/**
 * Lado do NAVEGADOR do `POST /api/assistente` (ADR-0014): manda a pergunta e lê a resposta NDJSON
 * (uma linha JSON por evento) conforme chega. Erro antes do streaming vem como `{ erro }` com o
 * status (401/403/400/429/503) e vira um evento `erro`.
 */

export type EventoChat =
  | { tipo: "inicio"; conversaId: string; fontes: FonteMensagem[]; restantes: number | null }
  | { tipo: "texto"; texto: string }
  | { tipo: "substituir"; texto: string }
  | { tipo: "fim"; mensagemId: string; semResposta: boolean; citadas: number[]; versao: string }
  | { tipo: "erro"; mensagem: string };

export interface PedidoChat {
  pergunta: string;
  conversaId: string | null;
  aulaId: string | null;
  teste: boolean;
}

/** Quebra o fluxo em linhas completas; devolve as linhas e o resto incompleto. */
export function linhasCompletas(acumulado: string): { linhas: string[]; resto: string } {
  const partes = acumulado.split("\n");
  const resto = partes.pop() ?? "";
  return { linhas: partes.filter((l) => l.trim()), resto };
}

export async function perguntarAoAssistente(pedido: PedidoChat, aoEvento: (e: EventoChat) => void, sinal?: AbortSignal): Promise<void> {
  let r: Response;
  try {
    r = await fetch("/api/assistente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pedido), signal: sinal });
  } catch {
    if (!sinal?.aborted) aoEvento({ tipo: "erro", mensagem: "Sem conexão com o servidor. Tente de novo." });
    return;
  }
  if (!r.ok || !r.body) {
    const corpo = (await r.json().catch(() => null)) as { erro?: string } | null;
    aoEvento({ tipo: "erro", mensagem: corpo?.erro ?? "O assistente não respondeu. Tente de novo." });
    return;
  }
  const leitor = r.body.getReader();
  const decodificador = new TextDecoder();
  let resto = "";
  try {
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      const l = linhasCompletas(resto + decodificador.decode(value, { stream: true }));
      resto = l.resto;
      for (const linha of l.linhas) aoEvento(JSON.parse(linha) as EventoChat);
    }
    if (resto.trim()) aoEvento(JSON.parse(resto) as EventoChat);
  } catch {
    if (!sinal?.aborted) aoEvento({ tipo: "erro", mensagem: "A resposta foi interrompida. Tente de novo." });
  }
}
