import "server-only";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { clienteIA, type ClienteIA } from "@/lib/assistente/cliente";
import { inicioDoDiaSql } from "@/lib/assistente/conversas";
import { custoUsd, USO_ZERO, type Uso } from "@/lib/assistente/regras";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { IDS_OPCOES } from "@/lib/avaliacoes/regras";
import { db, type Transacao } from "@/lib/db";
import {
  produtos,
  produtos_avaliacoes as av,
  produtos_avaliacoes_questoes as qst,
  produtos_modulos,
  produtos_modulos_aulas as aulas,
  produtos_modulos_aulas_legendas as legendas,
  produtos_modulos_aulas_sugestoes as sug,
} from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { decodificarLegenda, LIMITES_LEGENDA, lerLegenda } from "@/lib/legendas/regras";
import { lerObjetoLimitado } from "@/lib/legendas/servico";
import { erroDeCapitulosNaDuracao } from "@/lib/validators/catalogo";
import { LIMITES_ESTUDIO_IA, lerSugestao, montarPedidoEstudio, transcricaoComTempos } from "./regras";

/**
 * IA do Estúdio (RN-206): GERAR (chama o Claude com a transcrição da legenda, grava a sugestão com
 * tokens e modelo) e APLICAR por parte (descrição, capítulos, perguntas), sempre pela equipe e com
 * trava/trilha. O cliente é INJETÁVEL (testes usam o `ClienteFalso`, nunca a API real).
 */

const TABELA = "produtos_modulos_aulas_sugestoes";
export type ParteSugestao = "DESCRICAO" | "CAPITULOS" | "PERGUNTAS";

/** Aula viva deste criador com o curso e a duração (vídeo processado grava `duracao_seg`). */
async function aulaDoCriador(exec: Transacao | typeof db, criadorId: string, aulaId: string) {
  const [a] = await exec
    .select({ id: aulas.id, titulo: aulas.titulo, duracaoSeg: aulas.duracao_seg, produtoId: produtos.id, versao: aulas.updated_at })
    .from(aulas)
    .innerJoin(produtos_modulos, eq(produtos_modulos.id, aulas.modulo_id))
    .innerJoin(produtos, eq(produtos.id, produtos_modulos.produto_id))
    .where(and(eq(aulas.id, aulaId), eq(aulas.criador_id, criadorId), vivos(aulas), vivos(produtos_modulos), vivos(produtos)));
  if (!a) throw new ErroDeNegocio("Aula não encontrada.");
  return a;
}

/** Gerações de hoje (Brasília), inclusive descartadas: o custo aconteceu. */
export async function geracoesDeHoje(criadorId: string, agora = new Date()): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(sug).where(and(eq(sug.criador_id, criadorId), gte(sug.created_at, inicioDoDiaSql(agora))));
  return r?.n ?? 0;
}

/** Transcrição com `[mm:ss]` (relida do `.vtt`) ou, sem storage, o texto puro (sem capítulos). */
async function transcricaoDaAula(criadorId: string, aulaId: string): Promise<{ texto: string; comTempos: boolean }> {
  const [l] = await db
    .select({ chave: legendas.chave, texto: legendas.texto })
    .from(legendas)
    .where(and(eq(legendas.aula_id, aulaId), eq(legendas.criador_id, criadorId), vivos(legendas)))
    .orderBy(sql`${legendas.idioma} <> 'pt-BR'`, asc(legendas.idioma))
    .limit(1);
  if (!l) throw new ErroDeNegocio("Envie a legenda da aula antes de gerar sugestões.");
  try {
    const vtt = await lerObjetoLimitado(criadorId, l.chave, 2 * LIMITES_LEGENDA.bytes);
    const texto = transcricaoComTempos(lerLegenda(decodificarLegenda(vtt)));
    if (texto) return { texto, comTempos: true };
  } catch (e) {
    console.error("[estudio-ia] .vtt não lido; seguindo com o texto puro (sem capítulos):", l.chave, e instanceof Error ? e.message : e);
  }
  return { texto: l.texto, comTempos: false };
}

export interface SugestaoGerada {
  id: string;
  versao: Date;
}

/**
 * Gera e grava. Recusa sem chave, sem legenda, transcrição curta/longa demais ou limite do dia.
 * Resposta fora do formato (ou recusada): grava a geração JÁ DESCARTADA (tokens contam no consumo e
 * no limite) e recusa com mensagem.
 */
export async function gerarSugestao(
  p: { criadorId: string; autorId: string; aulaId: string; agora?: Date },
  cliente: ClienteIA | null = clienteIA(),
): Promise<SugestaoGerada> {
  if (!cliente) throw new ErroDeNegocio("IA não configurada.");
  const agora = p.agora ?? new Date();
  const aula = await aulaDoCriador(db, p.criadorId, p.aulaId);
  // ponytail: conferido antes da chamada (segurar trava durante a API seria pior); dois cliques no
  // mesmo segundo podem passar 1 do limite. Reserva atômica se o limite virar cobrança.
  if ((await geracoesDeHoje(p.criadorId, agora)) >= LIMITES_ESTUDIO_IA.porDia) throw new ErroDeNegocio(`Limite de ${LIMITES_ESTUDIO_IA.porDia} gerações por dia atingido. Tente amanhã.`);
  const t = await transcricaoDaAula(p.criadorId, p.aulaId);
  if (t.texto.length < LIMITES_ESTUDIO_IA.transcricaoMin) throw new ErroDeNegocio("Transcrição curta demais para gerar sugestões.");
  if (t.texto.length > LIMITES_ESTUDIO_IA.transcricaoMax) throw new ErroDeNegocio("Transcrição longa demais para gerar sugestões de uma vez.");

  let texto = "";
  let uso: Uso = USO_ZERO;
  let modelo = cliente.modelo;
  let recusou = false;
  try {
    for await (const ev of cliente.responder(montarPedidoEstudio(aula.titulo, t.texto), AbortSignal.timeout(180_000))) {
      if (ev.tipo === "texto") texto += ev.texto;
      else if (ev.tipo === "uso") uso = ev.uso;
      else ({ uso, modelo, recusou } = ev);
    }
  } catch (e) {
    console.error("[estudio-ia] falha na chamada:", e instanceof Error ? e.message : e);
    throw new ErroDeNegocio("A IA não respondeu agora. Tente de novo em instantes.");
  }
  const lida = recusou ? null : lerSugestao(texto, aula.duracaoSeg);
  const tokens = { modelo, tokens_entrada: uso.entrada, tokens_saida: uso.saida, tokens_cache_leitura: uso.cacheLeitura, tokens_cache_escrita: uso.cacheEscrita };

  return db.transaction(async (tx) => {
    const [s] = await tx
      .insert(sug)
      .values({
        criador_id: p.criadorId,
        aula_id: p.aulaId,
        descricao: lida?.descricao ?? "",
        capitulos: lida && t.comTempos ? lida.capitulos : [],
        perguntas: lida?.perguntas ?? [],
        ...tokens,
        modified_by: p.autorId,
        ...(lida ? {} : marcaDeExclusao(p.autorId)),
      })
      .returning({ id: sug.id, versao: sug.updated_at });
    await registrarAuditoria(tx, {
      userId: p.autorId,
      criadorId: p.criadorId,
      acao: "criar",
      tabela: TABELA,
      registroId: s.id,
      detalhes: lida ? `Gerou sugestões da IA para a aula "${aula.titulo}"` : `Geração da IA para a aula "${aula.titulo}" veio fora do formato (descartada)`,
      dadosNovos: { modelo, tokens_entrada: uso.entrada, tokens_saida: uso.saida },
    });
    if (!lida) return null;
    return s;
  }).then((s) => {
    if (!s) throw new ErroDeNegocio(recusou ? "A IA recusou esta transcrição. Revise a legenda e tente de novo." : "A IA devolveu um formato inesperado. Tente gerar de novo.");
    return s;
  });
}

async function sugestaoTravada(tx: Transacao, criadorId: string, sugestaoId: string, versao: Date) {
  const [s] = await tx
    .select()
    .from(sug)
    .where(and(travaDeColisao(sug, sugestaoId, versao), eq(sug.criador_id, criadorId)))
    .for("update");
  if (!s) throw new ErroDeNegocio(MSG_COLISAO);
  return s;
}

export interface PedidoAplicar {
  criadorId: string;
  autor: string;
  sugestaoId: string;
  versao: Date;
  parte: ParteSugestao;
  /** DESCRICAO e CAPITULOS: a versão da AULA que a tela abriu (trava da aula). */
  aulaVersao?: Date;
  /** PERGUNTAS: avaliação do MESMO curso da aula que recebe as questões. */
  avaliacaoId?: string;
  /** PERGUNTAS: quais (índices) aplicar; ausente = todas. */
  indices?: readonly number[];
}

/**
 * Aplica UMA parte. Descrição/capítulos sobrescrevem os da aula (trava pela versão da aula); perguntas
 * viram questões de única escolha no fim da avaliação escolhida. Marca a parte como aplicada.
 * Quem chama, depois do commit, reindexa a aula na base do assistente se a descrição mudou.
 */
export async function aplicarSugestao(tx: Transacao, p: PedidoAplicar): Promise<{ versao: Date; aulaId: string; aulaVersao: Date | null; questoes: number }> {
  const s = await sugestaoTravada(tx, p.criadorId, p.sugestaoId, p.versao);
  const aula = await aulaDoCriador(tx, p.criadorId, s.aula_id);
  const agora = new Date();
  let aulaVersao: Date | null = null;
  let questoes = 0;
  const trilha = { userId: p.autor, criadorId: p.criadorId } as const;

  if (p.parte === "DESCRICAO" || p.parte === "CAPITULOS") {
    if (!p.aulaVersao) throw new ErroDeNegocio(MSG_COLISAO);
    if (p.parte === "CAPITULOS") {
      if (!s.capitulos.length) throw new ErroDeNegocio("Esta sugestão não tem capítulos.");
      const erro = erroDeCapitulosNaDuracao(s.capitulos, aula.duracaoSeg);
      if (erro) throw new ErroDeNegocio(erro);
    }
    const valores = p.parte === "DESCRICAO" ? { descricao: s.descricao } : { capitulos: s.capitulos };
    const [antes] = await tx.select({ descricao: aulas.descricao, capitulos: aulas.capitulos }).from(aulas).where(travaDeColisao(aulas, aula.id, p.aulaVersao));
    const [a] = await tx
      .update(aulas)
      .set({ ...valores, updated_at: agora, modified_by: p.autor })
      .where(and(travaDeColisao(aulas, aula.id, p.aulaVersao), eq(aulas.criador_id, p.criadorId)))
      .returning({ versao: aulas.updated_at });
    if (!a || !antes) throw new ErroDeNegocio(MSG_COLISAO);
    aulaVersao = a.versao;
    await registrarAuditoria(tx, {
      ...trilha,
      acao: "atualizar",
      tabela: "produtos_modulos_aulas",
      registroId: aula.id,
      detalhes: `Aplicou ${p.parte === "DESCRICAO" ? "a descrição" : "os capítulos"} sugeridos pela IA na aula "${aula.titulo}"`,
      dadosAnteriores: p.parte === "DESCRICAO" ? { descricao: antes.descricao } : { capitulos: antes.capitulos },
      dadosNovos: valores,
    });
  } else {
    if (!p.avaliacaoId) throw new ErroDeNegocio("Escolha a avaliação que recebe as perguntas.");
    const [avaliacao] = await tx
      .select({ id: av.id, titulo: av.titulo })
      .from(av)
      .where(and(eq(av.id, p.avaliacaoId), eq(av.criador_id, p.criadorId), eq(av.produto_id, aula.produtoId), vivos(av)))
      .for("update");
    if (!avaliacao) throw new ErroDeNegocio("Avaliação não encontrada neste curso.");
    const escolhidas = (p.indices ? [...new Set(p.indices)].sort((x, y) => x - y) : s.perguntas.map((_, i) => i)).map((i) => s.perguntas[i]);
    if (!escolhidas.length || escolhidas.some((q) => !q)) throw new ErroDeNegocio("Escolha ao menos uma pergunta da sugestão.");
    const [{ ultima }] = await tx.select({ ultima: sql<number>`coalesce(max(${qst.ordem}), 0)::int` }).from(qst).where(and(eq(qst.avaliacao_id, avaliacao.id), vivos(qst)));
    const linhas = escolhidas.map((q, i) => ({
      criador_id: p.criadorId,
      avaliacao_id: avaliacao.id,
      ordem: ultima + i + 1,
      tipo: "UNICA" as const,
      enunciado: q.enunciado,
      opcoes: q.opcoes.slice(0, IDS_OPCOES.length).map((texto, j) => ({ id: IDS_OPCOES[j], texto })),
      gabarito: [IDS_OPCOES[q.correta]],
      peso: 1,
      explicacao: q.explicacao || null,
      modified_by: p.autor,
    }));
    await tx.insert(qst).values(linhas);
    questoes = linhas.length;
    await registrarAuditoria(tx, {
      ...trilha,
      acao: "criar",
      tabela: "produtos_avaliacoes_questoes",
      registroId: avaliacao.id,
      detalhes: `Criou ${questoes} questão(ões) sugeridas pela IA em "${avaliacao.titulo}" (aula "${aula.titulo}")`,
      dadosNovos: { enunciados: linhas.map((l) => l.enunciado) },
    });
  }

  const marca = p.parte === "DESCRICAO" ? { descricao_aplicada_em: agora } : p.parte === "CAPITULOS" ? { capitulos_aplicados_em: agora } : { perguntas_aplicadas_em: agora };
  const [n] = await tx
    .update(sug)
    .set({ ...marca, updated_at: agora, modified_by: p.autor })
    .where(and(travaDeColisao(sug, p.sugestaoId, p.versao), eq(sug.criador_id, p.criadorId)))
    .returning({ versao: sug.updated_at });
  if (!n) throw new ErroDeNegocio(MSG_COLISAO);
  await registrarAuditoria(tx, { ...trilha, acao: "atualizar", tabela: TABELA, registroId: p.sugestaoId, detalhes: `Aplicou a parte ${p.parte} da sugestão da IA`, dadosNovos: { parte: p.parte } });
  return { versao: n.versao, aulaId: aula.id, aulaVersao, questoes };
}

export async function descartarSugestao(tx: Transacao, p: { criadorId: string; autor: string; sugestaoId: string; versao: Date }): Promise<void> {
  await sugestaoTravada(tx, p.criadorId, p.sugestaoId, p.versao);
  const [n] = await tx
    .update(sug)
    .set(marcaDeExclusao(p.autor))
    .where(and(travaDeColisao(sug, p.sugestaoId, p.versao), eq(sug.criador_id, p.criadorId)))
    .returning({ id: sug.id });
  if (!n) throw new ErroDeNegocio(MSG_COLISAO);
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "excluir", tabela: TABELA, registroId: p.sugestaoId, detalhes: "Descartou a sugestão da IA" });
}

/** Aba "IA": sugestões vivas da aula (mais recentes primeiro), com o custo ESTIMADO (tabela de preços do assistente). */
export async function sugestoesDaAula(criadorId: string, aulaId: string) {
  const linhas = await db
    .select({
      id: sug.id,
      descricao: sug.descricao,
      capitulos: sug.capitulos,
      perguntas: sug.perguntas,
      modelo: sug.modelo,
      tokensEntrada: sug.tokens_entrada,
      tokensSaida: sug.tokens_saida,
      tokensCacheLeitura: sug.tokens_cache_leitura,
      tokensCacheEscrita: sug.tokens_cache_escrita,
      descricaoAplicadaEm: sug.descricao_aplicada_em,
      capitulosAplicadosEm: sug.capitulos_aplicados_em,
      perguntasAplicadasEm: sug.perguntas_aplicadas_em,
      criadaEm: sug.created_at,
      versao: sug.updated_at,
    })
    .from(sug)
    .where(and(eq(sug.criador_id, criadorId), eq(sug.aula_id, aulaId), vivos(sug)))
    .orderBy(desc(sug.created_at))
    .limit(20);
  return linhas.map((l) => ({
    ...l,
    custoUsd: custoUsd({ entrada: l.tokensEntrada, saida: l.tokensSaida, cacheLeitura: l.tokensCacheLeitura, cacheEscrita: l.tokensCacheEscrita }, l.modelo),
  }));
}
