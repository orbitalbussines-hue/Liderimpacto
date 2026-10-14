/**
 * Coleta PURA do que o aluno REALMENTE assistiu (RN-118, ADR-0006). O player chama `tocou(t)` a
 * cada `timeupdate` enquanto toca; `interromper()` em pause/seeking/espera/fim. Seek nunca conta:
 * fecha o trecho, e um salto entre dois `timeupdate` (seek sem evento, travada) também fecha.
 * `retirar()` entrega o corpo da batida dentro do contrato de `POST /api/progresso`.
 *
 * Os limites são os de `src/lib/progresso/regras.ts` (copiados para não levar Zod + schema do
 * Drizzle ao navegador; `acumulador.test.ts` trava a igualdade).
 */

export type Trecho = [number, number];

export const LIMITES_BATIDA = {
  /** Um trecho não passa disso (s). */
  trechoMaxSeg: 30,
  /** Trechos por batida. */
  maxTrechos: 20,
  /** Corpo JSON (bytes). */
  bytesMax: 4096,
  /** Batidas mais próximas que isso são ignoradas pelo servidor. */
  intervaloMinimoMs: 3000,
  /** A UI marca concluída quando o SERVIDOR responde; isto só antecipa a batida. */
  percentualConclusao: 90,
} as const;

/**
 * Maior avanço aceito entre dois `timeupdate` seguidos como reprodução contínua. O evento sai a
 * cada ~250 ms; a 2x e com a aba em segundo plano (timer de 1 s) o avanço chega a ~2 s.
 */
export const SALTO_MAXIMO_SEG = 3;

/** 3 casas: a mesma ponta arredonda igual nas duas batidas (sem buraco nem sobreposição). */
const arredondar = (n: number) => Math.round(n * 1000) / 1000;

/** Ordena e funde trechos que se tocam. */
function mesclar(trechos: readonly Trecho[]): Trecho[] {
  const saida: Trecho[] = [];
  for (const [a, b] of [...trechos].filter(([x, y]) => y > x).sort((x, y) => x[0] - y[0])) {
    const ultimo = saida.at(-1);
    if (ultimo && a <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], b);
    else saida.push([a, b]);
  }
  return saida;
}

/** Fatia em pedaços de no máximo `trechoMaxSeg`. */
function fatiar([a, b]: Trecho): Trecho[] {
  const saida: Trecho[] = [];
  for (let ini = a; ini < b; ini += LIMITES_BATIDA.trechoMaxSeg) saida.push([ini, Math.min(b, ini + LIMITES_BATIDA.trechoMaxSeg)]);
  return saida;
}

export interface Acumulador {
  /** `currentTime` num `timeupdate` com o vídeo TOCANDO (fora de seek). */
  tocou(t: number): void;
  /** Pause, seeking, waiting, ended: o próximo `tocou` abre trecho novo. */
  interromper(): void;
  /** Até 20 trechos (≤ 30 s, mesclados, dentro do vídeo) e zera; o que sobrar fica para a próxima. */
  retirar(): Trecho[];
  /** Envio falhou ou foi ignorado: os trechos voltam (o servidor deduplica por segundo). */
  devolver(trechos: readonly Trecho[]): void;
  vazio(): boolean;
}

/** `duracaoSeg` = a do servidor (o contrato aceita até `duracaoSeg + 1`). */
export function acumuladorDeIntervalos(duracaoSeg: number): Acumulador {
  const teto = duracaoSeg + 1;
  let fechados: Trecho[] = [];
  let aberto: Trecho | null = null;

  const fechar = () => {
    if (aberto && aberto[1] > aberto[0]) fechados.push(aberto);
    aberto = null;
  };

  return {
    tocou(bruto) {
      if (!Number.isFinite(bruto) || bruto < 0) return;
      const t = Math.min(bruto, teto);
      if (aberto && t >= aberto[1] && t - aberto[1] <= SALTO_MAXIMO_SEG) {
        aberto[1] = t;
        return;
      }
      fechar();
      aberto = [t, t];
    },
    interromper: fechar,
    retirar() {
      // O trecho em curso entra até agora e continua da mesma ponta (sem perder o pedaço entre batidas).
      const emCurso = aberto;
      if (emCurso && emCurso[1] > emCurso[0]) {
        fechados.push([emCurso[0], emCurso[1]]);
        aberto = [emCurso[1], emCurso[1]];
      }
      const todos = mesclar(fechados.map(([a, b]): Trecho => [arredondar(a), arredondar(b)])).flatMap(fatiar);
      const envio = todos.slice(0, LIMITES_BATIDA.maxTrechos);
      fechados = todos.slice(LIMITES_BATIDA.maxTrechos);
      return envio;
    },
    devolver(trechos) {
      fechados = mesclar([...fechados, ...trechos.map(([a, b]): Trecho => [a, b])]);
    },
    vazio: () => fechados.length === 0 && !(aberto && aberto[1] > aberto[0]),
  };
}

export interface CorpoBatida {
  aulaId: string;
  intervalos: Trecho[];
  posicao: number;
  duracaoSeg: number;
}

/** Corpo do beacon e da action (`esquemaBatida`): posição limitada ao vídeo. */
export function corpoDaBatida(aulaId: string, intervalos: Trecho[], posicao: number, duracaoSeg: number): CorpoBatida {
  const p = Number.isFinite(posicao) ? Math.min(Math.max(0, posicao), duracaoSeg + 1) : 0;
  return { aulaId, intervalos, posicao: arredondar(p), duracaoSeg };
}
