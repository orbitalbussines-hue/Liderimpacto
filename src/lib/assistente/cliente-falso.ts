import type { ClienteIA, EventoIA, PedidoIA } from "./cliente";

/**
 * Cliente FALSO do modelo — só para testes e para o seed de desenvolvimento (nunca chama a API).
 * Responde com a primeira frase dos dois primeiros trechos recebidos, citando `[1]` e `[2]`, em
 * pedaços (simula o streaming). Sem trechos = resposta sem citação. Respeita o aborto. Guarda o
 * último pedido para o teste conferir o que iria ao modelo.
 */
export class ClienteFalso implements ClienteIA {
  readonly modelo = "claude-sonnet-5-5";
  ultimoPedido: PedidoIA | null = null;
  chamadas = 0;

  /** `falhar`: lança `Error` genérico, ou a mensagem dada (simula a recusa da API). */
  constructor(private readonly opcoes: { resposta?: string; recusar?: boolean; falhar?: boolean | string; atrasoMs?: number } = {}) {}

  async *responder(p: PedidoIA, sinal: AbortSignal): AsyncIterable<EventoIA> {
    this.ultimoPedido = p;
    this.chamadas++;
    const ultima = p.mensagens.at(-1)?.texto ?? "";
    const entrada = Math.ceil((p.sistema.length + p.mensagens.reduce((s, m) => s + m.texto.length, 0)) / 4);
    yield { tipo: "uso", uso: { entrada, saida: 1, cacheLeitura: 0, cacheEscrita: 0 } };
    if (this.opcoes.falhar) throw new Error(typeof this.opcoes.falhar === "string" ? this.opcoes.falhar : "API indisponível (falso)");
    const texto = this.opcoes.resposta ?? respostaDosTrechos(ultima);
    const pedacos = texto.match(/[\s\S]{1,24}/g) ?? [];
    for (const pedaco of pedacos) {
      if (sinal.aborted) throw new DOMException("Abortado", "AbortError");
      if (this.opcoes.atrasoMs) await new Promise((r) => setTimeout(r, this.opcoes.atrasoMs));
      yield { tipo: "texto", texto: pedaco };
    }
    const uso = { entrada, saida: Math.ceil(texto.length / 4), cacheLeitura: 0, cacheEscrita: 0 };
    yield { tipo: "fim", uso, modelo: this.modelo, recusou: !!this.opcoes.recusar };
  }
}

function desescapar(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** "Primeira frase do trecho 1 [1]. Primeira frase do trecho 2 [2]." a partir da mensagem montada. */
export function respostaDosTrechos(mensagem: string): string {
  const trechos = [...mensagem.matchAll(/<trecho n="(\d+)"[^>]*>\n([\s\S]*?)\n<\/trecho>/g)].slice(0, 2);
  if (!trechos.length) return "Não encontrei isso nas aulas. Que tal perguntar na Comunidade?";
  const frases = trechos.map(([, n, t]) => {
    const frases = desescapar(t).split(/(?<=[.!?])\s/);
    const frase = (frases.find((f) => f.length >= 40) ?? frases[0] ?? "").trim().replace(/[.!?]$/, "");
    return `${frase} [${n}].`;
  });
  return `Pelo que as aulas mostram:\n\n${frases.join("\n\n")}`;
}
