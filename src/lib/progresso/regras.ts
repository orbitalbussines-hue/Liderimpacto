import { z } from "zod";
import { DURACAO_MAXIMA_PROGRESSO_SEG } from "@/lib/db/schema/progresso";

/**
 * Regras PURAS do progresso (RN-118, ADR-0006), travadas por teste. O servidor guarda 1 bit por
 * SEGUNDO do vídeo; a batida do player diz o que REALMENTE tocou desde a batida anterior.
 */

/** [início, fim) em segundos do vídeo. */
export type Intervalo = readonly [number, number];

/** Um trecho contínuo não passa disso numa batida (o player manda a cada ~10 s). */
export const LIMITE_INTERVALO_SEG = 30;
export const MAX_INTERVALOS_POR_BATIDA = 20;
/** Teto do que uma batida pode declarar: velocidade máxima × tempo real decorrido + folga. */
export const VELOCIDADE_MAXIMA = 2;
export const FOLGA_SEG = 15;
/** Primeira batida da aula (sem tempo decorrido para medir). */
export const TETO_PRIMEIRA_BATIDA_SEG = 60;
export const PERCENTUAL_CONCLUSAO = 90;
/** "Continuar assistindo" (SISTEMA.md §6): entre 1% e 94%. */
export const FAIXA_CONTINUAR = { min: 1, max: 94 } as const;
/** Mais perto do fim que isso, a aula reabre do começo. */
export const FIM_PARA_RECOMECAR_SEG = 10;
/** Batidas mais próximas que isso (mesma sessão e aula) são ignoradas sem erro. */
export const INTERVALO_MINIMO_BATIDA_MS = 3000;
export const TAMANHO_MAXIMO_CORPO = 4096;

/** Ordena e funde intervalos que se sobrepõem OU se encostam. Descarta vazios. */
export function mesclarIntervalos(intervalos: readonly Intervalo[]): [number, number][] {
  const ordenados = intervalos.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const saida: [number, number][] = [];
  for (const [a, b] of ordenados) {
    const ultimo = saida.at(-1);
    if (ultimo && a <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], b);
    else saida.push([a, b]);
  }
  return saida;
}

// zod 4: z.number() ja recusa NaN e Infinity.
const numero = z.number({ error: "Número inválido." });

/** Corpo da batida (beacon e action). Os ids vêm validados; criador e membro, da sessão. */
export const esquemaBatida = z
  .strictObject({
    aulaId: z.uuid("Identificador inválido."),
    intervalos: z.array(z.tuple([numero, numero]), { error: "Intervalos inválidos." }).max(MAX_INTERVALOS_POR_BATIDA, "Intervalos demais numa batida."),
    posicao: numero.min(0, "Posição inválida."),
    duracaoSeg: numero.gt(0, "Duração inválida.").max(DURACAO_MAXIMA_PROGRESSO_SEG, "Duração inválida."),
  })
  .superRefine((b, ctx) => {
    if (b.posicao > b.duracaoSeg + 1) ctx.addIssue({ code: "custom", message: "Posição fora do vídeo." });
    for (const [ini, fim] of b.intervalos) {
      if (ini < 0 || fim <= ini || fim > b.duracaoSeg + 1) ctx.addIssue({ code: "custom", message: "Intervalo fora do vídeo." });
      else if (fim - ini > LIMITE_INTERVALO_SEG) ctx.addIssue({ code: "custom", message: `Intervalo maior que ${LIMITE_INTERVALO_SEG} s.` });
    }
  });
export type Batida = z.infer<typeof esquemaBatida>;

/** O que o upsert recebe: um pedaço do bitmap a partir de `inicio` + números já arredondados. */
export interface BatidaPreparada {
  /** Primeiro segundo do pedaço (bit `inicio` do bitmap). */
  inicio: number;
  /** '0'/'1' a partir de `inicio`; vazio = batida só de posição. */
  bits: string;
  /** Segundos declarados nesta batida (bits ligados, sem contar repetição). */
  segundos: number;
  /** Maior fim assistido nesta batida (0 sem intervalo). */
  maiorFim: number;
  posicao: number;
}

/**
 * Arredonda as pontas para o segundo mais próximo (o segundo `s` conta se `[s, s+1)` está dentro):
 * batidas contíguas ([0;12,3] + [12,3;22]) não deixam buraco nem contam duas vezes.
 */
export function prepararBatida(b: Pick<Batida, "intervalos" | "posicao">): BatidaPreparada {
  const inteiros = mesclarIntervalos(b.intervalos.map(([a, f]) => [Math.round(a), Math.round(f)] as const));
  const posicao = Math.floor(b.posicao);
  if (inteiros.length === 0) return { inicio: 0, bits: "", segundos: 0, maiorFim: 0, posicao };
  const inicio = inteiros[0][0];
  const maiorFim = inteiros.at(-1)![1];
  const bits = Array.from({ length: maiorFim - inicio }, () => "0");
  let segundos = 0;
  for (const [a, f] of inteiros) {
    for (let s = a; s < f; s++) bits[s - inicio] = "1";
    segundos += f - a;
  }
  return { inicio, bits: bits.join(""), segundos, maiorFim, posicao };
}

/** Onde o player começa: a última posição, ou o começo se parou no fim (ou nunca abriu). */
export function retomarEm(ultimaPosicaoSeg: number | null, duracaoSeg: number | null): number {
  if (!ultimaPosicaoSeg || !duracaoSeg) return 0;
  return ultimaPosicaoSeg >= duracaoSeg - FIM_PARA_RECOMECAR_SEG ? 0 : ultimaPosicaoSeg;
}

/**
 * Botão "Concluir e avançar" permitido? Nesta fase SEMPRE; o construtor do player (passo 9) passa
 * a ler a regra por produto daqui (mudar em um lugar só).
 */
// Hoje nao depende do produto: a assinatura ja recebe o produto para o passo 9 nao mudar quem chama.
export const podeConcluirManual: (produto: { id: string }) => boolean = () => true;
