/**
 * Base de conhecimento (ADR-0014, RN-190 a RN-192) — PURO: divisão em trechos e montagem da busca.
 * O servidor usa para indexar; a tela da equipe usa os limites para validar na hora.
 */

export const LIMITES_CONHECIMENTO = {
  /** Trecho ideal: entre `minimo` e `maximo` caracteres, quebrando por parágrafo/sentença. */
  minimo: 800,
  alvo: 1000,
  maximo: 1200,
  /** Texto escrito pela equipe. */
  tituloTexto: 160,
  texto: 50_000,
  /** Termos da pergunta que entram na busca. */
  termos: 16,
} as const;

/** `modified_by` da reindexação automática sem pessoa (script, worker que sobe). */
export const AUTOR_SISTEMA = "00000000-0000-0000-0000-000000000000";

export interface TrechoGerado {
  texto: string;
  /** Segundo inicial (só transcrição). */
  inicioSeg: number | null;
}

const limpar = (s: string) => s.replace(/[ \t]+/g, " ").trim();

/** Corta um pedaço longo demais em pedaços <= maximo, preferindo o fim de palavra perto do alvo. */
function cortarDuro(s: string, alvo: number, maximo: number): string[] {
  const saida: string[] = [];
  let resto = s;
  while (resto.length > maximo) {
    const espaco = resto.lastIndexOf(" ", alvo);
    const corte = espaco > alvo / 2 ? espaco : alvo;
    saida.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) saida.push(resto);
  return saida;
}

/** Unidades <= maximo: o parágrafo inteiro, senão as sentenças dele, senão cortes por palavra. */
function unidades(texto: string, alvo: number, maximo: number): string[] {
  const paragrafos = texto
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n|\n/)
    .map(limpar)
    .filter(Boolean);
  return paragrafos.flatMap((p) => {
    if (p.length <= maximo) return [p];
    return p
      .split(/(?<=[.!?…])\s+/)
      .map(limpar)
      .filter(Boolean)
      .flatMap((s) => (s.length <= maximo ? [s] : cortarDuro(s, alvo, maximo)));
  });
}

/**
 * Texto corrido (descrição, texto da equipe) -> trechos de ~800–1200 caracteres. Junta unidades
 * (parágrafo ou sentença) até passar do mínimo sem estourar o máximo; o último pode ser menor.
 */
export function dividirEmTrechos(texto: string, l = LIMITES_CONHECIMENTO): string[] {
  const trechos: string[] = [];
  let atual = "";
  for (const u of unidades(texto, l.alvo, l.maximo)) {
    const junto = atual ? `${atual}\n${u}` : u;
    if (atual && junto.length > l.maximo) {
      trechos.push(atual);
      atual = u;
    } else atual = junto;
    if (atual.length >= l.minimo) {
      trechos.push(atual);
      atual = "";
    }
  }
  if (atual) trechos.push(atual);
  return trechos;
}

/**
 * Trechos da legenda (cada um com o segundo inicial) -> trechos de ~800–1200 caracteres com o
 * INÍCIO do primeiro trecho de legenda que entrou (a citação aponta "aula X, 03:15").
 */
export function dividirTranscricao(falas: readonly { inicio: number; texto: string }[], l = LIMITES_CONHECIMENTO): TrechoGerado[] {
  const saida: TrechoGerado[] = [];
  let atual = "";
  let inicio = 0;
  for (const f of falas) {
    const t = limpar(f.texto.replace(/\n/g, " "));
    if (!t) continue;
    if (atual && atual.length + 1 + t.length > l.maximo) {
      saida.push({ texto: atual, inicioSeg: inicio });
      atual = "";
    }
    if (!atual) inicio = Math.max(0, Math.floor(f.inicio));
    atual = atual ? `${atual} ${t}` : t;
    if (atual.length >= l.alvo) {
      saida.push({ texto: atual, inicioSeg: inicio });
      atual = "";
    }
  }
  if (atual) saida.push({ texto: atual, inicioSeg: inicio });
  // Fala gigante isolada (a legenda permite até 1000 caracteres por trecho; folga para o CHECK).
  return saida.flatMap((s) => (s.texto.length <= 2000 ? [s] : cortarDuro(s.texto, l.alvo, l.maximo).map((texto) => ({ texto, inicioSeg: s.inicioSeg }))));
}

/**
 * Pergunta livre -> expressão SEGURA para `to_tsquery` com OU entre os termos (o ranking põe na
 * frente quem casa mais termos). Só letras e dígitos sobrevivem: nada de operador do tsquery
 * (`& | ! ( ) :`) vindo de fora. Palavras de 1 letra saem; as vazias do português o Postgres tira.
 * Vazio = nada para buscar.
 */
export function consultaDaPergunta(pergunta: string, max: number = LIMITES_CONHECIMENTO.termos): string {
  const termos = new Set<string>();
  for (const m of pergunta.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    if (m[0].length < 2) continue;
    termos.add(m[0]);
    if (termos.size >= max) break;
  }
  return [...termos].join(" | ");
}

export const ROTULO_FONTE: Record<"AULA_TRANSCRICAO" | "AULA_DESCRICAO" | "PRODUTO_DESCRICAO" | "TEXTO", string> = {
  AULA_TRANSCRICAO: "Transcrição da aula",
  AULA_DESCRICAO: "Descrição da aula",
  PRODUTO_DESCRICAO: "Descrição do curso",
  TEXTO: "Texto da equipe",
};
