import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { avaliacaoQueTrava, avaliacoesDoProduto, type AvaliacaoDoCurso } from "@/lib/avaliacoes/estrutura";
import { db } from "@/lib/db";
import type { ConclusaoAula, SituacaoVideo, StatusProduto, TipoMaterial, TipoProduto } from "@/lib/db/schema/_enums";
import {
  arquivos,
  criadores_membros,
  produtos,
  produtos_modulos,
  produtos_modulos_aulas,
  produtos_modulos_aulas_anotacoes as nota,
  produtos_modulos_aulas_materiais as mat,
  produtos_modulos_aulas_progressos as pr,
  produtos_modulos_aulas_videos as vid,
  usuarios,
  type Capitulo,
} from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { matriculaAtiva } from "@/lib/matriculas/consultas";
import { motivoDoBloqueio, type MotivoBloqueio } from "@/lib/video/acesso";
import { PLAYER_PADRAO, type PlayerConfig } from "@/lib/vitrine/config";
import type { ProgressoDoCurso } from "./consultas";
import { podeConcluirManual, retomarEm } from "./regras";
import { chaveViva, ehEquipe, estaNaLista, hrefDaAula, type QuemPede } from "./visao";

/**
 * Página do curso e player do aluno. A trava de cada aula sai de `motivoDoBloqueio` (a MESMA
 * regra do token, da chave e do progresso): a tela mostra o cadeado e o motivo; o servidor recusa
 * do mesmo jeito. ALUNO não vê rascunho (produto ou módulo); a equipe vê tudo, liberado (prévia).
 */

export type EstadoAulaAluno = "concluida" | "atual" | "pendente" | "bloqueada";
export type EstadoModuloAluno = "concluido" | "andamento" | "bloqueado";

export interface AulaDoCurso {
  id: string;
  /** "2.3" = módulo 2, aula 3. */
  numero: string;
  titulo: string;
  duracaoSeg: number | null;
  thumbChave: string | null;
  href: string;
  /** bloqueada (não abre) > concluida > atual (a próxima a assistir) > pendente. */
  estado: EstadoAulaAluno;
  concluida: boolean;
  percentual: number;
  motivoBloqueio: MotivoBloqueio | null;
  /** Para o texto "Libera em 20/10" (motivo LIBERACAO). */
  liberaEm: Date | null;
  /** Para o texto "Conclua a aula 1.2 antes" (motivo PRE_REQUISITO). */
  preRequisito: { id: string; numero: string; titulo: string } | null;
  /** Para o texto "Seja aprovado em <título>" (motivo AVALIACAO, RN-125). */
  avaliacaoPendente: { id: string; titulo: string } | null;
}

/** Avaliação PUBLICADA do módulo (ou do curso) com a situação de quem pede. */
export interface AvaliacaoNoCurso {
  id: string;
  titulo: string;
  tipo: AvaliacaoDoCurso["tipo"];
  aprovada: boolean;
  melhorNota: number | null;
  liberaProximoModulo: boolean;
  obrigatoriaParaCertificado: boolean;
  href: string;
}

export interface ModuloDoCurso {
  id: string;
  /** "01", "02"... */
  numero: string;
  titulo: string;
  totalAulas: number;
  duracaoSeg: number;
  estado: EstadoModuloAluno;
  aulas: AulaDoCurso[];
  /** Avaliações publicadas deste módulo (passo 7). */
  avaliacoes: AvaliacaoNoCurso[];
}

export interface ProximaAula {
  aulaId: string;
  numero: string;
  titulo: string;
  href: string;
  /** "Continuar · Aula 2.3" ou "Começar · Aula 1.1". */
  rotulo: string;
  retomarEm: number;
}

const thumb = alias(arquivos, "thumb");

/** Módulos (aluno: só PUBLICADOS) e aulas vivas do produto, com o progresso do membro, na ordem do curso. */
async function estruturaDoProduto(q: QuemPede, produtoId: string) {
  const membro = q.membro.id;
  const linhas = await db
    .select({
      moduloId: produtos_modulos.id,
      moduloTitulo: produtos_modulos.titulo,
      moduloStatus: produtos_modulos.status,
      moduloOrdem: produtos_modulos.ordem,
      id: produtos_modulos_aulas.id,
      titulo: produtos_modulos_aulas.titulo,
      duracaoSeg: produtos_modulos_aulas.duracao_seg,
      liberaEm: produtos_modulos_aulas.libera_em,
      preRequisitoId: produtos_modulos_aulas.pre_requisito_aula_id,
      thumbChave: chaveViva(thumb),
      percentual: sql<number>`coalesce(${pr.percentual}, 0)::int`,
      concluida: sql<boolean>`coalesce(${pr.concluida}, false)`,
      concluidaPor: pr.concluida_por,
      ultimaPosicaoSeg: sql<number>`coalesce(${pr.ultima_posicao_seg}, 0)`,
      segundosAssistidos: sql<number>`coalesce(${pr.segundos_assistidos}, 0)`,
      progressoEm: pr.updated_at,
    })
    .from(produtos_modulos)
    .innerJoin(produtos_modulos_aulas, and(eq(produtos_modulos_aulas.modulo_id, produtos_modulos.id), vivos(produtos_modulos_aulas)))
    .leftJoin(thumb, eq(thumb.id, produtos_modulos_aulas.thumb_arquivo_id))
    .leftJoin(pr, and(eq(pr.aula_id, produtos_modulos_aulas.id), membro ? eq(pr.membro_id, membro) : sql`false`, vivos(pr)))
    .where(
      and(
        eq(produtos_modulos.produto_id, produtoId),
        eq(produtos_modulos.criador_id, q.criador.id),
        vivos(produtos_modulos),
        ...(ehEquipe(q) ? [] : [eq(produtos_modulos.status, "PUBLICADO")]),
      ),
    )
    .orderBy(asc(produtos_modulos.ordem), asc(produtos_modulos_aulas.ordem));
  return linhas;
}

type LinhaEstrutura = Awaited<ReturnType<typeof estruturaDoProduto>>[number];

/** Estados de módulos e aulas + progresso do curso + próxima aula (regra única de trava). */
const paraAvaliacaoNoCurso = (a: AvaliacaoDoCurso): AvaliacaoNoCurso => ({
  id: a.id,
  titulo: a.titulo,
  tipo: a.tipo,
  aprovada: a.aprovada,
  melhorNota: a.melhorNota,
  liberaProximoModulo: a.liberaProximoModulo,
  obrigatoriaParaCertificado: a.obrigatoriaParaCertificado,
  href: `/avaliacoes/${a.id}`,
});

function montarCurso(q: QuemPede, statusProduto: StatusProduto, matriculado: boolean, linhas: LinhaEstrutura[], agora: Date, avaliacoes: readonly AvaliacaoDoCurso[]) {
  const numeros = new Map<string, string>();
  const modulos: { id: string; titulo: string; linhas: LinhaEstrutura[] }[] = [];
  for (const l of linhas) {
    let m = modulos.at(-1);
    if (m?.id !== l.moduloId) modulos.push((m = { id: l.moduloId, titulo: l.moduloTitulo, linhas: [] }));
    m.linhas.push(l);
    numeros.set(l.id, `${modulos.length}.${m.linhas.length}`);
  }
  // Pré-requisito que não está publicado neste curso não trava (ninguém conseguiria concluí-lo).
  const publicadas = new Map(linhas.filter((l) => l.moduloStatus === "PUBLICADO").map((l) => [l.id, l]));
  const motivo = (l: LinhaEstrutura) => {
    const pre = l.preRequisitoId ? publicadas.get(l.preRequisitoId) : undefined;
    return motivoDoBloqueio(
      { papel: q.membro.papel, matriculaAtiva: matriculado },
      {
        liberaEm: l.liberaEm,
        statusProduto,
        statusModulo: l.moduloStatus,
        preRequisitoCumprido: !pre || pre.concluida,
        avaliacaoPendente: !!avaliacaoQueTrava(avaliacoes, l.moduloOrdem),
      },
      agora,
    );
  };
  const motivos = new Map(linhas.map((l) => [l.id, motivo(l)]));
  const abertas = linhas.filter((l) => motivos.get(l.id) === null && !l.concluida);
  // Próxima: a aula aberta assistida por último (sem concluir); senão a primeira aberta pendente.
  const emAndamento = abertas.filter((l) => l.progressoEm).sort((a, b) => b.progressoEm!.getTime() - a.progressoEm!.getTime())[0];
  const alvo = emAndamento ?? abertas[0];
  const proxima: ProximaAula | null = alvo
    ? {
        aulaId: alvo.id,
        numero: numeros.get(alvo.id)!,
        titulo: alvo.titulo,
        href: hrefDaAula(alvo.id),
        rotulo: `${emAndamento ? "Continuar" : linhas.some((l) => l.concluida) ? "Continuar" : "Começar"} · Aula ${numeros.get(alvo.id)}`,
        retomarEm: retomarEm(alvo.ultimaPosicaoSeg, alvo.duracaoSeg),
      }
    : null;

  const paraAula = (l: LinhaEstrutura): AulaDoCurso => {
    const m = motivos.get(l.id) ?? null;
    const pre = l.preRequisitoId ? publicadas.get(l.preRequisitoId) : undefined;
    return {
      id: l.id,
      numero: numeros.get(l.id)!,
      titulo: l.titulo,
      duracaoSeg: l.duracaoSeg,
      thumbChave: l.thumbChave,
      href: hrefDaAula(l.id),
      estado: m ? "bloqueada" : l.concluida ? "concluida" : l.id === proxima?.aulaId ? "atual" : "pendente",
      concluida: l.concluida,
      percentual: l.percentual,
      motivoBloqueio: m,
      liberaEm: l.liberaEm,
      preRequisito: pre ? { id: pre.id, numero: numeros.get(pre.id)!, titulo: pre.titulo } : null,
      avaliacaoPendente: m === "AVALIACAO" ? (({ id, titulo }) => ({ id, titulo }))(avaliacaoQueTrava(avaliacoes, l.moduloOrdem)!) : null,
    };
  };
  const listaModulos: ModuloDoCurso[] = modulos.map((m, i) => {
    const aulas = m.linhas.map(paraAula);
    return {
      id: m.id,
      numero: String(i + 1).padStart(2, "0"),
      titulo: m.titulo,
      totalAulas: aulas.length,
      duracaoSeg: aulas.reduce((s, a) => s + (a.duracaoSeg ?? 0), 0),
      estado: aulas.every((a) => a.concluida) ? "concluido" : aulas.every((a) => a.estado === "bloqueada") ? "bloqueado" : "andamento",
      aulas,
      avaliacoes: avaliacoes.filter((a) => a.moduloId === m.id).map(paraAvaliacaoNoCurso),
    };
  });
  const contaveis = [...publicadas.values()];
  const concluidas = contaveis.filter((l) => l.concluida).length;
  const progresso: ProgressoDoCurso = { concluidas, total: contaveis.length, percentual: contaveis.length ? Math.floor((concluidas * 100) / contaveis.length) : 0 };
  return { modulos: listaModulos, progresso, proxima, motivos, numeros };
}

const capa3x4 = alias(arquivos, "capa_3x4");
const capa16x9 = alias(arquivos, "capa_16x9");

/** Produto vivo DESTE criador por id ou slug (aluno: fora de rascunho) + professor + capas. */
async function produtoVisivel(q: QuemPede, filtro: { slug: string } | { id: string }) {
  const [p] = await db
    .select({
      id: produtos.id,
      titulo: produtos.titulo,
      slug: produtos.slug,
      descricao: produtos.descricao,
      tipo: produtos.tipo,
      status: produtos.status,
      corMarca: produtos.cor_marca,
      capa3x4Chave: chaveViva(capa3x4),
      capa16x9Chave: chaveViva(capa16x9),
      professorNome: usuarios.nome,
      professorImagem: usuarios.imagem,
    })
    .from(produtos)
    .leftJoin(capa3x4, eq(capa3x4.id, produtos.capa_3x4_arquivo_id))
    .leftJoin(capa16x9, eq(capa16x9.id, produtos.capa_16x9_arquivo_id))
    .leftJoin(criadores_membros, and(eq(criadores_membros.id, produtos.professor_membro_id), vivos(criadores_membros)))
    .leftJoin(usuarios, and(eq(usuarios.id, criadores_membros.usuario_id), vivos(usuarios)))
    .where(and(eq(produtos.criador_id, q.criador.id), vivos(produtos), "slug" in filtro ? eq(produtos.slug, filtro.slug) : eq(produtos.id, filtro.id)));
  if (!p || (!ehEquipe(q) && p.status === "RASCUNHO")) return null;
  return p;
}

const matriculadoEm = async (q: QuemPede, produtoId: string, agora: Date) =>
  ehEquipe(q) || (!!q.membro.id && (await matriculaAtiva(q.criador.id, q.membro.id, produtoId, agora)));

/** Tudo da página do curso. `null` = não existe neste criador (ou é rascunho, para o aluno): 404. */
export async function cursoDoAluno(q: QuemPede, slug: string, agora = new Date()) {
  const p = await produtoVisivel(q, { slug });
  if (!p) return null;
  const [linhas, matriculado, favorito, avaliacoes] = await Promise.all([
    estruturaDoProduto(q, p.id),
    matriculadoEm(q, p.id, agora),
    estaNaLista(q, { produtoId: p.id }),
    avaliacoesDoProduto(q.criador.id, p.id, q.membro.id),
  ]);
  const c = montarCurso(q, p.status, matriculado, linhas, agora, avaliacoes);
  const aulaIds = linhas.filter((l) => l.moduloStatus === "PUBLICADO").map((l) => l.id);
  const [{ materiais }] = aulaIds.length
    ? await db.select({ materiais: sql<number>`count(*)::int` }).from(mat).where(and(inArray(mat.aula_id, aulaIds), eq(mat.criador_id, q.criador.id), vivos(mat)))
    : [{ materiais: 0 }];
  return {
    produto: { id: p.id, titulo: p.titulo, slug: p.slug, descricao: p.descricao, tipo: p.tipo, status: p.status, corMarca: p.corMarca, capa3x4Chave: p.capa3x4Chave, capa16x9Chave: p.capa16x9Chave },
    professor: p.professorNome ? { nome: p.professorNome, imagem: p.professorImagem } : null,
    matriculado,
    favorito,
    modulos: c.modulos,
    progresso: c.progresso,
    proxima: c.proxima,
    /** Avaliações publicadas do CURSO (sem módulo), ex.: prova final. As de módulo estão em `modulos[].avaliacoes`. */
    avaliacoesDoCurso: avaliacoes.filter((a) => a.moduloId === null).map(paraAvaliacaoNoCurso),
    totais: { aulas: c.progresso.total, duracaoSeg: c.modulos.reduce((s, m) => s + m.duracaoSeg, 0), materiais },
  };
}

export interface FlagsPlayer {
  abas: { descricao: boolean; materiais: boolean; comentarios: boolean; anotacoes: boolean };
  playlist: boolean;
  /** Ligado no construtor E na preferência da pessoa (`usuarios.reproducao_automatica`). */
  autoplay: boolean;
  contagemAutoplaySeg: number;
  velocidade: boolean;
  marcadores: boolean;
  /** "Faltam N aulas para o seu certificado": N (> 0) com o aviso ligado, ALUNO matriculado; senão null. */
  aulasParaCertificado: number | null;
}

export interface AulaVizinha {
  id: string;
  numero: string;
  titulo: string;
  href: string;
}

export interface MaterialDoPlayer {
  id: string;
  nome: string;
  tipo: TipoMaterial;
  /** LINK: o endereço. PDF/DOC: nulo — pedir `acaoLinkDoMaterial({ materialId })` (link de 5 min). */
  url: string | null;
  tamanhoBytes: number | null;
}

/**
 * Tudo do player. `null` = aula não existe neste criador (ou é rascunho/oculta, para o aluno): 404.
 * `player` = `playerConfig` PUBLICADO no construtor (a página passa `configPublicada(...)?.player`;
 * sem publicação, o padrão de antes). RN-138.
 */
export async function aulaParaPlayer(q: QuemPede, aulaId: string, agora = new Date(), player: PlayerConfig = PLAYER_PADRAO) {
  const [base] = await db
    .select({ produtoId: produtos_modulos.produto_id, descricao: produtos_modulos_aulas.descricao, capitulos: produtos_modulos_aulas.capitulos })
    .from(produtos_modulos_aulas)
    .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
    .where(and(eq(produtos_modulos_aulas.id, aulaId), eq(produtos_modulos_aulas.criador_id, q.criador.id), vivos(produtos_modulos_aulas), vivos(produtos_modulos)));
  if (!base) return null;
  const p = await produtoVisivel(q, { id: base.produtoId });
  if (!p) return null;
  const [linhas, matriculado, autoplay, avaliacoes] = await Promise.all([
    estruturaDoProduto(q, p.id),
    matriculadoEm(q, p.id, agora),
    db.select({ v: usuarios.reproducao_automatica }).from(usuarios).where(eq(usuarios.id, q.usuario.id)).then((r) => r[0]?.v ?? true),
    avaliacoesDoProduto(q.criador.id, p.id, q.membro.id),
  ]);
  const l = linhas.find((x) => x.id === aulaId);
  if (!l) return null; // módulo oculto, para o aluno
  const c = montarCurso(q, p.status, matriculado, linhas, agora, avaliacoes);
  const motivo = c.motivos.get(aulaId) ?? null;
  const pode = motivo === null;
  const indice = linhas.indexOf(l);
  const vizinha = (x: LinhaEstrutura | undefined): AulaVizinha | null => (x ? { id: x.id, numero: c.numeros.get(x.id)!, titulo: x.titulo, href: hrefDaAula(x.id) } : null);
  const aberta = (x: LinhaEstrutura) => c.motivos.get(x.id) === null;
  const membro = q.membro.id;
  const [video, materiais, anotacoes, favorito] = await Promise.all([
    db.select({ id: vid.id, situacao: vid.situacao }).from(vid).where(and(eq(vid.aula_id, aulaId), eq(vid.criador_id, q.criador.id), vivos(vid))).then((r) => r[0] ?? null),
    pode
      ? db
          .select({ id: mat.id, nome: mat.nome, tipo: mat.tipo, url: mat.url, tamanhoBytes: arquivos.tamanho_bytes })
          .from(mat)
          .leftJoin(arquivos, and(eq(arquivos.id, mat.arquivo_id), vivos(arquivos)))
          .where(and(eq(mat.aula_id, aulaId), eq(mat.criador_id, q.criador.id), vivos(mat)))
          .orderBy(asc(mat.created_at))
      : Promise.resolve([] as MaterialDoPlayer[]),
    membro
      ? db
          .select({ id: nota.id, tempoSeg: nota.tempo_seg, texto: nota.texto, versao: nota.updated_at })
          .from(nota)
          .where(and(eq(nota.aula_id, aulaId), eq(nota.membro_id, membro), eq(nota.criador_id, q.criador.id), vivos(nota)))
          .orderBy(asc(nota.tempo_seg), asc(nota.created_at))
      : Promise.resolve([]),
    estaNaLista(q, { aulaId }),
  ]);
  const faltam = c.progresso.total - c.progresso.concluidas;
  const flags: FlagsPlayer = {
    abas: { ...player.abas },
    playlist: player.playlist,
    autoplay: player.autoplay && autoplay,
    contagemAutoplaySeg: 5,
    velocidade: player.velocidade,
    marcadores: player.marcadores,
    aulasParaCertificado: player.avisoCertificado && q.membro.papel === "ALUNO" && matriculado && faltam > 0 ? faltam : null,
  };
  return {
    aula: { id: l.id, numero: c.numeros.get(l.id)!, titulo: l.titulo, descricao: base.descricao, duracaoSeg: l.duracaoSeg, capitulos: base.capitulos as Capitulo[], thumbChave: l.thumbChave },
    modulo: { id: l.moduloId, numero: c.numeros.get(l.id)!.split(".")[0], titulo: l.moduloTitulo },
    produto: { id: p.id, titulo: p.titulo, slug: p.slug, tipo: p.tipo as TipoProduto, corMarca: p.corMarca },
    pode,
    motivoBloqueio: motivo,
    /** Só com `pode`: o player chama `acaoIniciarReproducao({ aulaId })` quando `situacao` = PRONTO. */
    video: video as { id: string; situacao: SituacaoVideo } | null,
    materiais: materiais as MaterialDoPlayer[],
    anotacoes: anotacoes.map((n) => ({ id: n.id, tempoSeg: n.tempoSeg, texto: n.texto, versao: n.versao.toISOString() })),
    progresso: {
      percentual: l.percentual,
      concluida: l.concluida,
      concluidaPor: l.concluidaPor as ConclusaoAula | null,
      ultimaPosicaoSeg: l.ultimaPosicaoSeg,
      segundosAssistidos: l.segundosAssistidos,
    },
    retomarEm: retomarEm(l.ultimaPosicaoSeg, l.duracaoSeg),
    anterior: vizinha(linhas.slice(0, indice).reverse().find(aberta)),
    proxima: vizinha(linhas.slice(indice + 1).find(aberta)),
    playlist: c.modulos,
    progressoDoCurso: c.progresso,
    favorito,
    concluirManual: pode && !!membro && podeConcluirManual({ id: p.id }),
    flags,
  };
}
