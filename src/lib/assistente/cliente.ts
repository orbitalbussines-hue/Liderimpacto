import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { LIMITES_ASSISTENTE, MODELO_PADRAO, type Uso } from "./regras";

/**
 * Cliente do modelo (ADR-0014): interface PEQUENA para o serviço não depender do SDK — os testes
 * injetam um falso e NUNCA chamam a API real. A chave (`ANTHROPIC_API_KEY`) só existe no servidor:
 * nunca vai ao cliente, a log ou à trilha. Sem chave = `null` (as telas mostram "IA não configurada").
 */

export interface PedidoIA {
  sistema: string;
  /** Histórico + mensagem atual (a última é do usuário). */
  mensagens: { papel: "USUARIO" | "ASSISTENTE"; texto: string }[];
  maxTokens: number;
}

export type EventoIA =
  | { tipo: "texto"; texto: string }
  /** Uso conhecido até agora (o início traz a entrada; o fim, a saída). Interrompido = vale o último. */
  | { tipo: "uso"; uso: Uso }
  | { tipo: "fim"; uso: Uso; modelo: string; recusou: boolean };

export interface ClienteIA {
  readonly modelo: string;
  /** Lança se `sinal` abortar (o serviço grava o que chegou). */
  responder(p: PedidoIA, sinal: AbortSignal): AsyncIterable<EventoIA>;
}

export const iaConfigurada = (): boolean => !!process.env.ANTHROPIC_API_KEY;

/** `anthropic-workspace-id` quando `ANTHROPIC_WORKSPACE_ID` existe (chave de organização sem workspace). */
export function cabecalhosPadrao(env: Record<string, string | undefined> = process.env): Record<string, string> {
  const ws = env.ANTHROPIC_WORKSPACE_ID?.trim();
  return ws ? { "anthropic-workspace-id": ws } : {};
}

/** A API recusou porque a chave não é de um workspace e o cabeçalho não veio. */
export const ehErroDeWorkspace = (e: unknown): boolean => e instanceof Error && /anthropic-workspace-id|not scoped to a workspace/i.test(e.message);

const usoDe = (u: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }, antes: Uso): Uso => ({
  entrada: u.input_tokens ?? antes.entrada,
  saida: u.output_tokens ?? antes.saida,
  cacheLeitura: u.cache_read_input_tokens ?? antes.cacheLeitura,
  cacheEscrita: u.cache_creation_input_tokens ?? antes.cacheEscrita,
});

/**
 * Messages API com streaming (`client.messages.stream`). Prompt de sistema com `cache_control`
 * (estável por criador; abaixo do mínimo de tokens o cache só não acontece, sem erro). Esforço
 * `low`: é um chat de dúvidas, e o pensamento adaptativo do modelo conta no `max_tokens`.
 * Sem `fallbacks` de recusa (ADR-0014): uma recusa vira a resposta fixa `RESPOSTA_RECUSADA`.
 */
class ClienteAnthropic implements ClienteIA {
  readonly modelo = process.env.ANTHROPIC_MODELO?.trim() || MODELO_PADRAO;
  // Lê ANTHROPIC_API_KEY do ambiente; 2 novas tentativas em 429/5xx (padrão do SDK). Chave que não
  // é de um workspace exige o cabeçalho `anthropic-workspace-id` (ANTHROPIC_WORKSPACE_ID, opcional).
  private readonly api = new Anthropic({ maxRetries: 2, timeout: 60_000, defaultHeaders: cabecalhosPadrao() });

  async *responder(p: PedidoIA, sinal: AbortSignal): AsyncIterable<EventoIA> {
    const stream = this.api.messages.stream(
      {
        model: this.modelo,
        max_tokens: p.maxTokens || LIMITES_ASSISTENTE.maxTokens,
        system: [{ type: "text", text: p.sistema, cache_control: { type: "ephemeral" } }],
        messages: p.mensagens.map((m) => ({ role: m.papel === "USUARIO" ? ("user" as const) : ("assistant" as const), content: m.texto })),
        output_config: { effort: "low" },
      },
      { signal: sinal },
    );
    let uso: Uso = { entrada: 0, saida: 0, cacheLeitura: 0, cacheEscrita: 0 };
    for await (const ev of stream) {
      if (ev.type === "message_start") {
        uso = usoDe(ev.message.usage, uso);
        yield { tipo: "uso", uso };
      } else if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
        yield { tipo: "texto", texto: ev.delta.text };
      } else if (ev.type === "message_delta") {
        uso = usoDe(ev.usage, uso);
        yield { tipo: "uso", uso };
      }
    }
    const final = await stream.finalMessage();
    yield { tipo: "fim", uso: usoDe(final.usage, uso), modelo: final.model, recusou: final.stop_reason === "refusal" };
  }
}

let padrao: ClienteIA | null = null;

/** Cliente real do processo (um só), ou `null` sem chave. */
export function clienteIA(): ClienteIA | null {
  if (!iaConfigurada()) return null;
  padrao ??= new ClienteAnthropic();
  return padrao;
}
