import "server-only";
import { type ConnectionOptions, Queue } from "bullmq";
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { produtos, produtos_modulos, produtos_modulos_aulas, produtos_modulos_aulas_videos as videos } from "@/lib/db/schema";
import type { SituacaoVideo } from "@/lib/db/schema/_enums";
import { vivos } from "@/lib/db/soft-delete";
import { NOME_FILA_VIDEO, NOME_FILA_VIDEO_DLQ, conexaoRedis, prefixoFila, type JobVideo } from "./fila";

/**
 * Leituras do Estúdio de vídeo (/admin/estudio-de-video). `criadorId` vem SEMPRE do host; só
 * vídeos vivos de aulas, módulos e produtos vivos (o vídeo de uma aula removida não aparece).
 */

export interface FiltrosEstudio {
  busca?: string;
  situacao?: SituacaoVideo;
  produtoId?: string;
  pagina: number;
  porPagina: number;
}

/** `%` e `_` digitados viram literais no ILIKE. */
const curinga = (texto: string) => `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// Junções comuns: vídeo -> aula -> módulo -> produto, todos do MESMO criador.
const NA_AULA = and(eq(produtos_modulos_aulas.id, videos.aula_id), eq(produtos_modulos_aulas.criador_id, videos.criador_id));
const NO_MODULO = and(eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id), eq(produtos_modulos.criador_id, videos.criador_id));
const NO_PRODUTO = and(eq(produtos.id, produtos_modulos.produto_id), eq(produtos.criador_id, videos.criador_id));

/** WHERE comum: só o criador do host e tudo vivo na cadeia. */
const onde = (criadorId: string, extra: SQL[] = []) =>
  and(eq(videos.criador_id, criadorId), vivos(videos), vivos(produtos_modulos_aulas), vivos(produtos_modulos), vivos(produtos), ...extra);

export async function listarVideos(criadorId: string, f: FiltrosEstudio) {
  const extra: SQL[] = [];
  if (f.situacao) extra.push(eq(videos.situacao, f.situacao));
  if (f.produtoId) extra.push(eq(produtos.id, f.produtoId));
  if (f.busca) extra.push(or(ilike(produtos_modulos_aulas.titulo, curinga(f.busca)), ilike(videos.nome_original, curinga(f.busca)))!);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(videos)
    .innerJoin(produtos_modulos_aulas, NA_AULA)
    .innerJoin(produtos_modulos, NO_MODULO)
    .innerJoin(produtos, NO_PRODUTO)
    .where(onde(criadorId, extra));
  const linhas = await db
    .select({
      id: videos.id,
      situacao: videos.situacao,
      nomeOriginal: videos.nome_original,
      tamanhoBytes: videos.tamanho_bytes,
      duracaoSeg: videos.duracao_seg,
      resolucoes: videos.resolucoes,
      erro: videos.erro,
      tentativas: videos.tentativas,
      enviadoEm: videos.created_at,
      aulaId: produtos_modulos_aulas.id,
      aula: produtos_modulos_aulas.titulo,
      modulo: produtos_modulos.titulo,
      produtoId: produtos.id,
      produto: produtos.titulo,
    })
    .from(videos)
    .innerJoin(produtos_modulos_aulas, NA_AULA)
    .innerJoin(produtos_modulos, NO_MODULO)
    .innerJoin(produtos, NO_PRODUTO)
    .where(onde(criadorId, extra))
    .orderBy(desc(videos.created_at), desc(videos.id))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina);
  return { total, linhas };
}

/** Cabeçalho: vídeos, horas prontas, armazenamento estimado (tamanho dos ORIGINAIS) e por situação. */
export async function totaisDoEstudio(criadorId: string) {
  const [t] = await db
    .select({
      videos: sql<number>`count(*)::int`,
      segundosProntos: sql<number>`coalesce(sum(${videos.duracao_seg}) filter (where ${videos.situacao} = 'PRONTO'), 0)::float8`,
      bytesOriginais: sql<number>`coalesce(sum(${videos.tamanho_bytes}), 0)::float8`,
      processando: sql<number>`count(*) filter (where ${videos.situacao} in ('ENVIANDO', 'PROCESSANDO'))::int`,
      falhos: sql<number>`count(*) filter (where ${videos.situacao} = 'FALHOU')::int`,
    })
    .from(videos)
    .innerJoin(produtos_modulos_aulas, NA_AULA)
    .innerJoin(produtos_modulos, NO_MODULO)
    .innerJoin(produtos, NO_PRODUTO)
    .where(onde(criadorId));
  return t ?? { videos: 0, segundosProntos: 0, bytesOriginais: 0, processando: 0, falhos: 0 };
}

/** Produtos que têm vídeo vivo (opções do filtro "Curso"). */
export async function produtosComVideo(criadorId: string) {
  return db
    .selectDistinct({ id: produtos.id, titulo: produtos.titulo })
    .from(videos)
    .innerJoin(produtos_modulos_aulas, NA_AULA)
    .innerJoin(produtos_modulos, NO_MODULO)
    .innerJoin(produtos, NO_PRODUTO)
    .where(onde(criadorId))
    .orderBy(produtos.titulo, produtos.id);
}

// ---------------------------------------------------------------- estado da fila (BullMQ)

export type EstadoFila = { disponivel: false } | { disponivel: true; aguardando: number; processando: number; falhos: number };

export interface FilasDoEstudio {
  fila: Queue<JobVideo>;
  dlq: Queue<JobVideo & { erro?: string }>;
}

/** Teto da leitura da fila: Redis fora do ar não pode segurar a página. */
const PRAZO_FILA_MS = 2500;
/** ponytail: lê até 500 jobs por estado; fila maior que isso pede contagem por criador no Redis. */
const MAX_JOBS = 499;

/** Filas só de LEITURA do estúdio (uma conexão por processo; erro de conexão vira "indisponível"). */
export function criarFilasDoEstudio(conexao: ConnectionOptions = { ...(conexaoRedis() as object), maxRetriesPerRequest: 1, connectTimeout: 2000 }): FilasDoEstudio {
  const opcoes = { connection: conexao, prefix: prefixoFila() };
  const filas = { fila: new Queue<JobVideo>(NOME_FILA_VIDEO, opcoes), dlq: new Queue<JobVideo>(NOME_FILA_VIDEO_DLQ, opcoes) };
  // Sem ouvinte, o "error" do EventEmitter derruba o processo quando o Redis cai.
  for (const q of Object.values(filas)) q.on("error", () => undefined);
  return filas;
}

const global = globalThis as unknown as { __filasEstudio?: FilasDoEstudio };

/**
 * Jobs aguardando / processando / falhos (DLQ) DESTE criador. A fila é da plataforma inteira:
 * conta só os jobs cujo vídeo é do criador (o job carrega só o `videoId`), para nunca expor o
 * volume de outra área. Redis fora do ar, sem REDIS_URL ou lento: `{ disponivel: false }`.
 */
export async function estadoDaFila(criadorId: string, filas?: FilasDoEstudio): Promise<EstadoFila> {
  try {
    const f = filas ?? (global.__filasEstudio ??= criarFilasDoEstudio());
    const [aguardando, ativos, falhos] = await Promise.race([
      Promise.all([
        f.fila.getJobs(["waiting", "delayed", "prioritized", "waiting-children"], 0, MAX_JOBS),
        f.fila.getJobs(["active"], 0, MAX_JOBS),
        f.dlq.getJobs(["waiting", "delayed", "prioritized"], 0, MAX_JOBS),
      ]),
      new Promise<never>((_, rejeitar) => setTimeout(() => rejeitar(new Error("fila não respondeu")), PRAZO_FILA_MS)),
    ]);
    const idsDe = (jobs: ({ data?: Partial<JobVideo> } | undefined)[]) => jobs.map((j) => j?.data?.videoId).filter((v): v is string => typeof v === "string");
    const todos = [...new Set([...idsDe(aguardando), ...idsDe(ativos), ...idsDe(falhos)])].filter((v) => /^[0-9a-f-]{36}$/i.test(v));
    const meus = new Set(
      todos.length
        ? (await db.select({ id: videos.id }).from(videos).where(and(eq(videos.criador_id, criadorId), inArray(videos.id, todos), vivos(videos)))).map((v) => v.id)
        : [],
    );
    const contar = (jobs: ({ data?: Partial<JobVideo> } | undefined)[]) => new Set(idsDe(jobs).filter((v) => meus.has(v))).size;
    return { disponivel: true, aguardando: contar(aguardando), processando: contar(ativos), falhos: contar(falhos) };
  } catch (e) {
    console.error("[estudio] fila de vídeo indisponível:", e instanceof Error ? e.message : e);
    return { disponivel: false };
  }
}
