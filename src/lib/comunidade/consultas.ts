import "server-only";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { urlDeImagemOuNula } from "@/lib/armazenamento/cliente";
import { db } from "@/lib/db";
import {
  arquivos,
  criadores_canais as canais,
  criadores_canais_posts as posts,
  criadores_canais_posts_anexos as anexos,
  criadores_canais_posts_votos as votos,
  criadores_comentarios as comentarios,
  criadores_curtidas as curtidas,
  criadores_membros as membros,
  produtos,
  produtos_modulos,
  produtos_modulos_aulas as aulas,
  produtos_modulos_aulas_progressos as progressos,
  usuarios,
} from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { avaliacaoPendenteSql } from "@/lib/avaliacoes/sql";
import { proximoEventoDoMembro, type EventoDoMembro } from "@/lib/eventos/consultas";
import { preRequisitoCumpridoSql } from "@/lib/progresso/sql";
import { aulaNaVitrine, matriculaValendoSql, type QuemPede } from "@/lib/progresso/visao";
import { acessoDaAula } from "@/lib/video/acesso-aula";
import { codificarCursor, decodificarCursor, DIAS_MEMBROS_ATIVOS, enqueteAberta, FINALIDADE_IMAGEM, iniciais, resumo, type OrdemFeed } from "./regras";
import { canalVisivelSql, ocultoVisivelSql, silenciadoAte } from "./sql";

/**
 * LEITURAS da comunidade para as telas (RN-130 a RN-132). Recebem o `membroDaPagina(TODOS_OS_MEMBROS)`
 * inteiro (`QuemPede`): criador do HOST, membro da sessão. Quem pede só vê canais a que tem acesso;
 * oculto só para a equipe e o autor; removido para ninguém. Datas como `Date` (a tela formata).
 */

export interface AutorPublico {
  membroId: string;
  nome: string;
  iniciais: string;
  imagem: string | null;
  /** DONO/ADMIN (selo "Equipe"). */
  equipe: boolean;
}

export interface AnexoDoPost {
  id: string;
  tipo: "IMAGEM" | "PDF";
  nome: string;
  tamanho: number;
  /** Imagem: URL assinada (vale 1–2 h, estável na hora: serve ao `next/image`). PDF: `null` — use `acaoLinkDoAnexo`. */
  url: string | null;
}

export interface EnqueteDoPost {
  pergunta: string;
  opcoes: { indice: number; texto: string; votos: number }[];
  totalVotos: number;
  meuVoto: number | null;
  encerraEm: Date | null;
  aberta: boolean;
}

export interface PostDoFeed {
  id: string;
  canal: { id: string; nome: string };
  autor: AutorPublico;
  /** "em <aula>". */
  aula: { id: string; titulo: string } | null;
  /** Texto PURO: renderize com `segmentosDeTexto` (NUNCA `dangerouslySetInnerHTML`). */
  texto: string;
  criadoEm: Date;
  editadoEm: Date | null;
  fixado: boolean;
  /** Só a equipe e o autor recebem post oculto (com o motivo). */
  oculto: { motivo: string } | null;
  curtidas: number;
  comentarios: number;
  curtiu: boolean;
  anexos: AnexoDoPost[];
  enquete: EnqueteDoPost | null;
  podeEditar: boolean;
  podeRemover: boolean;
  /** Fixar, ocultar (equipe). */
  podeModerar: boolean;
  /** `updated_at` ISO: a trava de editar/remover/fixar/ocultar. */
  versao: string;
}

export interface PaginaDoFeed {
  itens: PostDoFeed[];
  /** Passe de volta para a próxima página; `null` = acabou. Inválido = volta ao começo. */
  proximoCursor: string | null;
}

const ehEquipe = (q: QuemPede) => q.membro.papel !== "ALUNO";
const eu = (q: QuemPede) => q.membro.id;

const curtiuSql = (q: QuemPede, alvo: SQL) =>
  q.membro.id
    ? sql<boolean>`exists (select 1 from ${curtidas} k where ${alvo} and k.membro_id = ${q.membro.id} and k.is_deleted = false)`
    : sql<boolean>`false`;

const autorCampos = { membroId: membros.id, nome: usuarios.nome, imagem: usuarios.imagem, papel: membros.papel };
const autorDe = (l: { membroId: string; nome: string; imagem: string | null; papel: string }): AutorPublico => ({
  membroId: l.membroId,
  nome: l.nome,
  iniciais: iniciais(l.nome),
  imagem: l.imagem,
  equipe: l.papel !== "ALUNO",
});

/** Posts visíveis para quem pede, com o que o feed mostra (sem anexos/enquete: `decorar`). */
function selecionarPosts(q: QuemPede, agora: Date, extra: (SQL | undefined)[]) {
  return db
    .select({
      id: posts.id,
      canalId: canais.id,
      canalNome: canais.nome,
      ...autorCampos,
      aulaId: aulas.id,
      aulaTitulo: aulas.titulo,
      texto: posts.texto,
      criadoEm: posts.created_at,
      editadoEm: posts.editado_em,
      fixadoEm: posts.fixado_em,
      ocultoEm: posts.oculto_em,
      motivo: posts.motivo_ocultacao,
      curtidas: posts.curtidas,
      comentarios: posts.comentarios,
      curtiu: curtiuSql(q, sql`k.post_id = ${posts.id}`),
      enquetePergunta: posts.enquete_pergunta,
      enqueteOpcoes: posts.enquete_opcoes,
      enqueteEncerraEm: posts.enquete_encerra_em,
      updatedAt: posts.updated_at,
    })
    .from(posts)
    .innerJoin(canais, eq(canais.id, posts.canal_id))
    .innerJoin(membros, eq(membros.id, posts.autor_membro_id))
    .innerJoin(usuarios, eq(usuarios.id, membros.usuario_id))
    .leftJoin(aulas, and(eq(aulas.id, posts.aula_id), vivos(aulas)))
    .where(and(eq(posts.criador_id, q.criador.id), vivos(posts), canalVisivelSql(q, agora), ocultoVisivelSql(q, posts), ...extra));
}

type LinhaPost = Awaited<ReturnType<typeof selecionarPosts>>[number];

/** Anexos (1 consulta) e enquetes (1 consulta) da página inteira. */
async function decorar(q: QuemPede, linhas: LinhaPost[], agora: Date): Promise<PostDoFeed[]> {
  const ids = linhas.map((l) => l.id);
  const comEnquete = linhas.filter((l) => l.enquetePergunta).map((l) => l.id);
  const [listaAnexos, listaVotos] = await Promise.all([
    ids.length
      ? db
          .select({ id: anexos.id, postId: anexos.post_id, nome: arquivos.nome_original, tamanho: arquivos.tamanho_bytes, finalidade: arquivos.finalidade, chave: arquivos.chave })
          .from(anexos)
          .innerJoin(arquivos, and(eq(arquivos.id, anexos.arquivo_id), vivos(arquivos)))
          .where(and(inArray(anexos.post_id, ids), vivos(anexos)))
          .orderBy(asc(anexos.ordem))
      : [],
    comEnquete.length
      ? db
          .select({ postId: votos.post_id, opcao: votos.opcao, total: sql<number>`count(*)::int`, meu: sql<boolean>`bool_or(${votos.membro_id} = ${eu(q) ?? null})` })
          .from(votos)
          .where(and(inArray(votos.post_id, comEnquete), vivos(votos)))
          .groupBy(votos.post_id, votos.opcao)
      : [],
  ]);
  const urls = await Promise.all(listaAnexos.map((a) => (a.finalidade === FINALIDADE_IMAGEM ? urlDeImagemOuNula(q.criador.id, a.chave) : Promise.resolve(null))));
  const equipe = ehEquipe(q);
  return linhas.map((l) => {
    const daEnquete = listaVotos.filter((v) => v.postId === l.id);
    const opcoes = (l.enqueteOpcoes ?? []).map((texto, indice) => ({ indice, texto, votos: daEnquete.find((v) => v.opcao === indice)?.total ?? 0 }));
    const souAutor = eu(q) !== null && eu(q) === l.membroId;
    return {
      id: l.id,
      canal: { id: l.canalId, nome: l.canalNome },
      autor: autorDe(l),
      aula: l.aulaId ? { id: l.aulaId, titulo: l.aulaTitulo ?? "" } : null,
      texto: l.texto,
      criadoEm: l.criadoEm,
      editadoEm: l.editadoEm,
      fixado: l.fixadoEm !== null,
      oculto: l.ocultoEm ? { motivo: l.motivo ?? "" } : null,
      curtidas: l.curtidas,
      comentarios: l.comentarios,
      curtiu: l.curtiu,
      anexos: listaAnexos
        .map((a, i) => ({ a, url: urls[i] }))
        .filter(({ a }) => a.postId === l.id)
        .map(({ a, url }) => ({ id: a.id, tipo: a.finalidade === FINALIDADE_IMAGEM ? "IMAGEM" : "PDF", nome: a.nome, tamanho: a.tamanho, url })),
      enquete: l.enquetePergunta
        ? {
            pergunta: l.enquetePergunta,
            opcoes,
            totalVotos: opcoes.reduce((s, o) => s + o.votos, 0),
            meuVoto: daEnquete.find((v) => v.meu)?.opcao ?? null,
            encerraEm: l.enqueteEncerraEm,
            aberta: enqueteAberta(l.enqueteEncerraEm, agora),
          }
        : null,
      podeEditar: souAutor,
      podeRemover: souAutor || equipe,
      podeModerar: equipe,
      versao: l.updatedAt.toISOString(),
    };
  });
}

/**
 * Feed: um canal (`canalId`) ou todos os canais visíveis (sem `canalId`, a "Home" da comunidade),
 * "Recentes" (data) ou "Mais curtidos" (curtidas, depois data), paginado por cursor. Canal que quem
 * pede não vê (ou de outro criador) = `null` (404 na tela). No "Mais curtidos" uma curtida entre as
 * páginas pode repetir/pular um post — aceito (ADR-0009).
 */
export async function feedDaComunidade(
  q: QuemPede,
  f: { canalId?: string | null; ordem?: OrdemFeed; cursor?: string | null; limite?: number } = {},
  agora = new Date(),
): Promise<PaginaDoFeed | null> {
  const limite = Math.min(Math.max(f.limite ?? 20, 1), 50);
  if (f.canalId) {
    const [c] = await db.select({ id: canais.id }).from(canais).where(and(eq(canais.id, f.canalId), canalVisivelSql(q, agora)));
    if (!c) return null;
  }
  const cur = decodificarCursor(f.cursor);
  const curtidos = f.ordem === "CURTIDOS";
  const depoisDoCursor = cur
    ? curtidos
      ? sql`(${posts.curtidas}, ${posts.created_at}, ${posts.id}) < (${cur.curtidas}, ${cur.criadoEm}, ${cur.id}::uuid)`
      : sql`(${posts.created_at}, ${posts.id}) < (${cur.criadoEm}, ${cur.id}::uuid)`
    : undefined;
  const linhas = await selecionarPosts(q, agora, [f.canalId ? eq(posts.canal_id, f.canalId) : undefined, depoisDoCursor])
    .orderBy(...(curtidos ? [desc(posts.curtidas)] : []), desc(posts.created_at), desc(posts.id))
    .limit(limite + 1);
  const pagina = linhas.slice(0, limite);
  const ultimo = pagina.at(-1);
  return {
    itens: await decorar(q, pagina, agora),
    proximoCursor: linhas.length > limite && ultimo ? codificarCursor({ curtidas: ultimo.curtidas, criadoEm: ultimo.criadoEm, id: ultimo.id }) : null,
  };
}

/** "32 publicações": total visível no canal (ou em todos). */
export async function totalDePublicacoes(q: QuemPede, canalId?: string | null, agora = new Date()): Promise<number> {
  const [r] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(posts)
    .innerJoin(canais, eq(canais.id, posts.canal_id))
    .where(and(eq(posts.criador_id, q.criador.id), vivos(posts), canalVisivelSql(q, agora), ocultoVisivelSql(q, posts), canalId ? eq(posts.canal_id, canalId) : undefined));
  return r?.total ?? 0;
}

export interface ComentarioDaArvore {
  id: string;
  autor: AutorPublico;
  /** Texto PURO (ver `PostDoFeed.texto`). */
  texto: string;
  criadoEm: Date;
  editadoEm: Date | null;
  oculto: { motivo: string } | null;
  curtidas: number;
  curtiu: boolean;
  podeEditar: boolean;
  podeRemover: boolean;
  podeModerar: boolean;
  versao: string;
  /** Respostas (1 nível só; resposta não tem `respostas`). */
  respostas: ComentarioDaArvore[];
}

/** ponytail: até 500 comentários por alvo, sem paginação; paginar quando um post passar disso. */
async function arvoreDeComentarios(q: QuemPede, alvo: SQL): Promise<ComentarioDaArvore[]> {
  const linhas = await db
    .select({
      id: comentarios.id,
      paiId: comentarios.pai_id,
      ...autorCampos,
      texto: comentarios.texto,
      criadoEm: comentarios.created_at,
      editadoEm: comentarios.editado_em,
      ocultoEm: comentarios.oculto_em,
      motivo: comentarios.motivo_ocultacao,
      curtidas: comentarios.curtidas,
      curtiu: curtiuSql(q, sql`k.comentario_id = ${comentarios.id}`),
      updatedAt: comentarios.updated_at,
    })
    .from(comentarios)
    .innerJoin(membros, eq(membros.id, comentarios.autor_membro_id))
    .innerJoin(usuarios, eq(usuarios.id, membros.usuario_id))
    .where(and(eq(comentarios.criador_id, q.criador.id), vivos(comentarios), alvo, ocultoVisivelSql(q, comentarios)))
    .orderBy(asc(comentarios.created_at), asc(comentarios.id))
    .limit(500);
  const equipe = ehEquipe(q);
  const no = (l: (typeof linhas)[number]): ComentarioDaArvore => {
    const souAutor = eu(q) !== null && eu(q) === l.membroId;
    return {
      id: l.id,
      autor: autorDe(l),
      texto: l.texto,
      criadoEm: l.criadoEm,
      editadoEm: l.editadoEm,
      oculto: l.ocultoEm ? { motivo: l.motivo ?? "" } : null,
      curtidas: l.curtidas,
      curtiu: l.curtiu,
      podeEditar: souAutor,
      podeRemover: souAutor || equipe,
      podeModerar: equipe,
      versao: l.updatedAt.toISOString(),
      respostas: [],
    };
  };
  const principais = new Map(linhas.filter((l) => !l.paiId).map((l) => [l.id, no(l)]));
  // Resposta de comentário que quem pede não vê (oculto/removido) some junto.
  for (const l of linhas) if (l.paiId) principais.get(l.paiId)?.respostas.push(no(l));
  return [...principais.values()];
}

/** Post aberto (`/comunidade?post=<id>`) com os comentários. `null` = não existe ou sem acesso. */
export async function postDaComunidade(q: QuemPede, postId: string, agora = new Date()): Promise<{ post: PostDoFeed; comentarios: ComentarioDaArvore[] } | null> {
  const [l] = await selecionarPosts(q, agora, [eq(posts.id, postId)]);
  if (!l) return null;
  const [post] = await decorar(q, [l], agora);
  return { post, comentarios: await arvoreDeComentarios(q, eq(comentarios.post_id, postId)) };
}

/** Aba "Comentários" do player: só para quem pode ASSISTIR a aula (`acessoDaAula`). `null` = sem acesso. */
export async function comentariosDaAula(q: QuemPede, aulaId: string, agora = new Date()): Promise<ComentarioDaArvore[] | null> {
  const acesso = await acessoDaAula(q.criador.id, aulaId, { papel: q.membro.papel, membroId: q.membro.id }, agora);
  if (!acesso?.pode) return null;
  return arvoreDeComentarios(q, eq(comentarios.aula_id, aulaId));
}

export interface LateralDaComunidade {
  /** Próximo encontro PUBLICADO do público do membro que ainda não terminou (`proximoEventoDoMembro`); nulo = a tela esconde o bloco. */
  proximoEncontro: EventoDoMembro | null;
  fixados: { id: string; canalId: string; canalNome: string; titulo: string }[];
  /**
   * Mais publicações + comentários nos últimos 30 dias. `pontos` = saldo da gamificação; nulo com ela
   * desligada, para a equipe e para quem saiu do ranking (a tela mostra as interações).
   */
  membrosAtivos: (AutorPublico & { pontos: number | null; interacoes: number })[];
}

export async function lateralDaComunidade(q: QuemPede, agora = new Date()): Promise<LateralDaComunidade> {
  const desde = new Date(agora.getTime() - DIAS_MEMBROS_ATIVOS * 86_400_000);
  const [proximoEncontro, fixados, ativos] = await Promise.all([
    proximoEventoDoMembro(q, agora),
    db
      .select({ id: posts.id, canalId: canais.id, canalNome: canais.nome, texto: posts.texto })
      .from(posts)
      .innerJoin(canais, eq(canais.id, posts.canal_id))
      .where(and(eq(posts.criador_id, q.criador.id), vivos(posts), sql`${posts.fixado_em} is not null and ${posts.oculto_em} is null`, canalVisivelSql(q, agora)))
      .orderBy(desc(posts.fixado_em))
      .limit(5),
    db.execute<{ membro_id: string; nome: string; imagem: string | null; papel: string; interacoes: number; pontos: number | null }>(sql`
      select m.id as membro_id, u.nome, u.imagem, m.papel, count(*)::int as interacoes,
        -- Gamificação ligada: saldo (soma do razão) do ALUNO que não saiu do ranking (RN-146); senão nulo.
        case when m.papel = 'ALUNO' and u.aparecer_no_ranking and exists (
          select 1 from criadores_gamificacao g where g.criador_id = ${q.criador.id} and g.ligada and g.is_deleted = false)
        then (select coalesce(sum(pt.pontos), 0)::int from criadores_membros_pontos pt where pt.membro_id = m.id) end as pontos
      from (
        select autor_membro_id as membro from criadores_canais_posts
        where criador_id = ${q.criador.id} and is_deleted = false and oculto_em is null and created_at >= ${desde}
        union all
        select autor_membro_id from criadores_comentarios
        where criador_id = ${q.criador.id} and is_deleted = false and oculto_em is null and created_at >= ${desde}
      ) x
      join criadores_membros m on m.id = x.membro and m.is_deleted = false and m.status = 'ATIVO'
      join usuarios u on u.id = m.usuario_id
      group by m.id, u.nome, u.imagem, m.papel, u.aparecer_no_ranking
      order by count(*) desc, u.nome
      limit 5`),
  ]);
  return {
    proximoEncontro,
    fixados: fixados.map((f) => ({ id: f.id, canalId: f.canalId, canalNome: f.canalNome, titulo: resumo(f.texto) })),
    membrosAtivos: ativos.rows.map((m) => ({ ...autorDe({ membroId: m.membro_id, nome: m.nome, imagem: m.imagem, papel: m.papel }), pontos: m.pontos, interacoes: m.interacoes })),
  };
}

export interface SituacaoNaComunidade {
  /** Tem vínculo nesta área (SUPER_ADMIN sem vínculo só lê). */
  podeParticipar: boolean;
  equipe: boolean;
  /** Silenciado até (não publica nem comenta); `null` = livre. */
  silenciadoAte: Date | null;
}

/** Para o compositor: mostrar/esconder "Publicar" e o aviso de silenciado. */
export async function situacaoNaComunidade(q: QuemPede, agora = new Date()): Promise<SituacaoNaComunidade> {
  return {
    podeParticipar: q.membro.id !== null,
    equipe: ehEquipe(q),
    silenciadoAte: q.membro.id ? await silenciadoAte(q.criador.id, q.membro.id, agora) : null,
  };
}

/**
 * Aulas para o "em <aula>" do compositor. ALUNO: aulas com progresso dele (inclusive concluídas),
 * mais recentes primeiro, SÓ as que ainda pode assistir agora (mesma regra de `motivoDoBloqueio`:
 * curso fora de rascunho, módulo publicado, liberada, matrícula valendo, avaliação e
 * pré-requisito). Equipe: aulas visíveis mais recentes do criador. `acaoPublicar` confere de novo.
 */
export async function aulasParaRelacionar(q: QuemPede, limite = 30, agora = new Date()): Promise<{ id: string; titulo: string; produtoTitulo: string }[]> {
  const n = Math.min(Math.max(limite, 1), 100);
  const base = db
    .select({ id: aulas.id, titulo: aulas.titulo, produtoTitulo: produtos.titulo })
    .from(aulas)
    .innerJoin(produtos_modulos, eq(produtos_modulos.id, aulas.modulo_id))
    .innerJoin(produtos, eq(produtos.id, produtos_modulos.produto_id));
  if (q.membro.papel !== "ALUNO") return base.where(aulaNaVitrine(q.criador.id, agora)).orderBy(desc(aulas.created_at)).limit(n);
  if (!q.membro.id) return [];
  return base
    .innerJoin(progressos, and(eq(progressos.aula_id, aulas.id), eq(progressos.membro_id, q.membro.id), vivos(progressos)))
    .where(
      and(
        aulaNaVitrine(q.criador.id, agora),
        matriculaValendoSql(q, agora),
        sql`not ${avaliacaoPendenteSql(produtos_modulos.id, q.membro.id)}`,
        preRequisitoCumpridoSql(aulas.pre_requisito_aula_id, q.membro.id),
      ),
    )
    .orderBy(desc(progressos.updated_at))
    .limit(n);
}
