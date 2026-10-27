/**
 * Reconferência dos vídeos contra o storage (incidente 23/10: o li-storage subiu sem volume e
 * perdeu os objetos; runbook em docs/deploy-easypanel.md, "Armazenamento sem volume").
 *
 *   npm run video:reconferir               só LEITURA: relatório
 *   npm run video:reconferir -- --aplicar  REPROCESSAR vai para a fila pela regra do botão
 *                                          "Reprocessar" do estúdio (reprocessarVideo)
 *
 * Para cada vídeo vivo (aula, módulo e curso vivos) de TODOS os criadores, fora os em ENVIANDO:
 * HEAD do original e, se PRONTO, do HLS; classifica em OK / REPROCESSAR / SEM_ORIGINAL
 * (src/lib/video/reconferir.ts). SEM_ORIGINAL só é listado: o criador precisa reenviar.
 * Idempotente: job já na fila conta como OK e o jobId = videoId nunca duplica.
 * No fim: arquivos do bucket `arquivos` (tabela `arquivos` e legendas) que faltam no storage.
 *
 * Precisa de DATABASE_URL, REDIS_URL e S3_* (Shell do li-worker-video).
 */
import { and, asc, eq, ne } from "drizzle-orm";
import { cabecalhoDoObjeto, type Bucket } from "@/lib/armazenamento/cliente";
import { db } from "@/lib/db";
import {
  arquivos,
  criadores,
  produtos,
  produtos_modulos,
  produtos_modulos_aulas as aulas,
  produtos_modulos_aulas_legendas as legendas,
  produtos_modulos_aulas_videos as videos,
} from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { conexaoRedis, criarFilaVideo } from "@/lib/video/fila";
import { reprocessarVideo } from "@/lib/video/provedor-proprio";
import { chavesDoHls, classificar, type Classe } from "@/lib/video/reconferir";

const ATOR = "sistema:reconferir";
const HEADS_PARALELOS = 8;

const existe = async (bucket: Bucket, criadorId: string, chave: string) => (await cabecalhoDoObjeto({ bucket, criadorId, chave })) !== null;

/** `f` sobre cada item, no máximo `n` ao mesmo tempo, na ordem de entrada. */
async function emParalelo<T, R>(itens: readonly T[], n: number, f: (t: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < itens.length) {
        const k = i++;
        saida[k] = await f(itens[k]);
      }
    }),
  );
  return saida;
}

const corte = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);

function imprimirTabela(cabecalho: string[], linhas: string[][]): void {
  const larguras = cabecalho.map((c, i) => Math.max(c.length, ...linhas.map((l) => l[i].length)));
  const linha = (l: string[]) => l.map((c, i) => c.padEnd(larguras[i])).join("  ").trimEnd();
  console.log(linha(cabecalho));
  console.log(larguras.map((w) => "-".repeat(w)).join("  "));
  for (const l of linhas) console.log(linha(l));
}

async function conferirVideos(aplicar: boolean): Promise<void> {
  const lista = await db
    .select({
      id: videos.id,
      criadorId: videos.criador_id,
      situacao: videos.situacao,
      chaveOrigem: videos.chave_origem,
      prefixoHls: videos.prefixo_hls,
      resolucoes: videos.resolucoes,
      criador: criadores.slug,
      curso: produtos.titulo,
      modulo: produtos_modulos.titulo,
      aula: aulas.titulo,
    })
    .from(videos)
    .innerJoin(criadores, eq(criadores.id, videos.criador_id))
    .innerJoin(aulas, and(eq(aulas.id, videos.aula_id), eq(aulas.criador_id, videos.criador_id)))
    .innerJoin(produtos_modulos, and(eq(produtos_modulos.id, aulas.modulo_id), eq(produtos_modulos.criador_id, videos.criador_id)))
    .innerJoin(produtos, and(eq(produtos.id, produtos_modulos.produto_id), eq(produtos.criador_id, videos.criador_id)))
    .where(and(vivos(videos), ne(videos.situacao, "ENVIANDO"), vivos(criadores), vivos(aulas), vivos(produtos_modulos), vivos(produtos)))
    .orderBy(asc(criadores.slug), asc(produtos.titulo), asc(produtos_modulos.ordem), asc(aulas.ordem));

  const fila = criarFilaVideo({ ...(conexaoRedis() as object), maxRetriesPerRequest: 1, connectTimeout: 3000 });
  try {
    const resultados = await emParalelo(lista, HEADS_PARALELOS, async (v) => {
      if (v.situacao === "ENVIANDO") throw new Error("ENVIANDO fora da consulta");
      const original = await existe("videosOriginais", v.criadorId, v.chaveOrigem);
      const hls =
        v.situacao === "PRONTO" && v.prefixoHls ? await Promise.all(chavesDoHls(v.prefixoHls, v.resolucoes).map((k) => existe("hls", v.criadorId, k))) : [];
      const naFila = v.situacao === "PROCESSANDO" && !!(await fila.getJob(v.id));
      return { v, ...classificar({ situacao: v.situacao, original, hls, naFila }) };
    });

    const linhas = resultados.map(({ v, classe, motivo }) => [v.criador, corte(`${v.curso} > ${v.modulo} > ${v.aula}`, 80), v.situacao, classe, motivo]);
    console.log(`\nVÍDEOS (${lista.length} vivos, fora os em envio)\n`);
    imprimirTabela(["CRIADOR", "CURSO > MÓDULO > AULA", "SITUAÇÃO", "CLASSE", "MOTIVO"], linhas);

    const totais: Record<Classe, number> = { OK: 0, REPROCESSAR: 0, SEM_ORIGINAL: 0 };
    for (const r of resultados) totais[r.classe]++;
    console.log(`\nTotais: OK ${totais.OK} | REPROCESSAR ${totais.REPROCESSAR} | SEM_ORIGINAL ${totais.SEM_ORIGINAL} (reenviar pelo estúdio)`);

    const reprocessar = resultados.filter((r) => r.classe === "REPROCESSAR");
    if (!aplicar) {
      if (reprocessar.length) console.log("Modo leitura: nada mudou. Para pôr os REPROCESSAR na fila: npm run video:reconferir -- --aplicar");
      return;
    }
    let ok = 0;
    for (const { v } of reprocessar) {
      try {
        const r = await reprocessarVideo(v.criadorId, v.id, { sistema: ATOR });
        if (r.enfileirado) ok++;
        else console.error(`  ${v.id}: marcado PROCESSANDO, mas a fila não respondeu (rode de novo)`);
      } catch (e) {
        console.error(`  ${v.id}: não reprocessou: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    console.log(`--aplicar: ${ok} de ${reprocessar.length} vídeo(s) na fila (trilha com "${ATOR}").`);
  } finally {
    await fila.close();
  }
}

async function conferirArquivos(): Promise<void> {
  const registros = [
    ...(await db
      .select({ criadorId: arquivos.criador_id, criador: criadores.slug, chave: arquivos.chave, tipo: arquivos.finalidade, nome: arquivos.nome_original })
      .from(arquivos)
      .innerJoin(criadores, eq(criadores.id, arquivos.criador_id))
      .where(and(vivos(arquivos), eq(arquivos.status, "DISPONIVEL"), vivos(criadores)))),
    ...(await db
      .select({ criadorId: legendas.criador_id, criador: criadores.slug, chave: legendas.chave, tipo: legendas.idioma, nome: aulas.titulo })
      .from(legendas)
      .innerJoin(criadores, eq(criadores.id, legendas.criador_id))
      .innerJoin(aulas, and(eq(aulas.id, legendas.aula_id), eq(aulas.criador_id, legendas.criador_id)))
      .where(and(vivos(legendas), vivos(criadores)))).map((l) => ({ ...l, tipo: `LEGENDA .vtt ${l.tipo}`, nome: `aula "${l.nome}"` })),
  ];
  const faltam = (await emParalelo(registros, HEADS_PARALELOS, async (a) => ((await existe("arquivos", a.criadorId, a.chave)) ? null : a))).filter((a) => a !== null);
  console.log(`\nARQUIVOS (bucket arquivos): ${registros.length} conferidos, ${faltam.length} faltando`);
  if (faltam.length) imprimirTabela(["CRIADOR", "TIPO", "NOME", "CHAVE"], faltam.map((a) => [a.criador, a.tipo, corte(a.nome, 50), a.chave]));
}

async function principal(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.some((a) => a !== "--aplicar")) {
    console.error("Uso: npm run video:reconferir [-- --aplicar]");
    return 2;
  }
  await conferirVideos(args.includes("--aplicar"));
  await conferirArquivos();
  return 0;
}

principal()
  .catch((e: unknown) => {
    console.error("video:reconferir falhou:", e instanceof Error ? e.message : e);
    return 1;
  })
  .then((codigo) => process.exit(codigo));
