import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { duracaoCurta } from "@/components/aluno/formatos";
import type { DestaqueConfig, ItemFileira, VarianteCartao } from "@/components/vitrine/tipos";
import { varianteDoTipo } from "@/components/vitrine/tipos";
import { urlDeImagemOuNula } from "@/lib/armazenamento/cliente";
import { ROTULO_TIPO_PRODUTO } from "@/lib/catalogo/regras";
import { db } from "@/lib/db";
import { arquivos, criadores_grupos_membros, produtos, produtos_modulos, produtos_modulos_aulas } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { cursosDoAluno } from "@/lib/matriculas/consultas";
import {
  cartoesEscolhidos,
  comImagens,
  continuarAssistindo,
  cursoDoAluno,
  mentorias,
  minhaLista,
  novidades,
  visualizacoesPorProduto,
  type ItemCartao,
} from "@/lib/progresso/consultas";
import { top10 } from "@/lib/progresso/top10";
import { ehEquipe, type QuemPede } from "@/lib/progresso/visao";
import { trilhasParaVitrine } from "@/lib/trilhas/consultas";
import { configPublicada } from "./cache";
import { FILEIRAS_PADRAO, fileiraParaQuem, tituloComNome, type BotaoDestaque, type ConfigVitrine, type DestaqueVitrine, type FileiraVitrine } from "./config";

/**
 * Resolução da vitrine NO SERVIDOR (SISTEMA.md §6; RN-136): cada fileira pelas consultas que já
 * existem (passo 5/7), respeitando quantidade, ordenação e audiência; o destaque pelos alvos dos
 * botões. Sem config publicada vale o PADRÃO (as 6 fileiras e o destaque automático de antes).
 * A página `/` e a prévia (`/previa-vitrine`) usam ESTAS funções e os MESMOS componentes.
 */

/** Quem vê: o `QuemPede` + o nome (título "Continue assistindo, {nome}"). */
export type QuemVe = QuemPede & { usuario: { id: string; nome: string } };

export interface FileiraResolvida {
  id: string;
  titulo: string;
  variante: VarianteCartao;
  tag?: string;
  itens: ItemFileira[];
}

export type DestaqueResolvido = DestaqueConfig;

/** Cartões no formato do `ItemFileira` (só o que o cartão usa viaja para o cliente). */
async function paraFileira(criadorId: string, itens: readonly (ItemCartao & { progresso?: number })[]): Promise<ItemFileira[]> {
  return (await comImagens(criadorId, itens)).map((i) => ({ id: i.id, titulo: i.titulo, subtitulo: i.subtitulo, imagemUrl: i.imagemUrl, href: i.href, progresso: i.progresso }));
}

/** Grupos vivos do membro (audiência das fileiras). */
export async function gruposDoMembro(q: QuemPede): Promise<Set<string>> {
  if (!q.membro.id) return new Set();
  const gm = criadores_grupos_membros;
  const l = await db
    .select({ id: gm.grupo_id })
    .from(gm)
    .where(and(eq(gm.membro_id, q.membro.id), eq(gm.criador_id, q.criador.id), vivos(gm)));
  return new Set(l.map((g) => g.id));
}

/** Fileiras que esta pessoa vê, na ordem da config (sem config: as 6 padrão). */
export async function fileirasVisiveis(q: QuemPede, config: ConfigVitrine | null): Promise<FileiraVitrine[]> {
  const fileiras = config?.fileiras ?? FILEIRAS_PADRAO;
  const precisaGrupos = !ehEquipe(q) && fileiras.some((f) => f.grupos.length > 0);
  const grupos = precisaGrupos ? await gruposDoMembro(q) : new Set<string>();
  return fileiras.filter((f) => fileiraParaQuem(f, { equipe: ehEquipe(q), grupos }));
}

async function itensDaFileira(q: QuemPede, f: FileiraVitrine, agora: Date): Promise<(ItemCartao & { progresso?: number })[]> {
  const n = f.quantidade;
  switch (f.tipo) {
    case "CONTINUAR":
      return continuarAssistindo(q, n, agora);
    case "TOP10":
      return top10(q.criador.id, n);
    case "NOVIDADES":
      return novidades(q, n, agora);
    case "TRILHAS":
      return trilhasParaVitrine(q, n, agora);
    case "LISTA":
      return (await minhaLista(q, agora)).slice(0, n);
    case "MANUAL":
      return (await cartoesEscolhidos(q, f.itensManuais, agora)).slice(0, n);
    case "MENTORIAS": {
      if (f.ordenacao !== "MAIS_ASSISTIDOS") return mentorias(q, n, agora);
      const [todas, vistas] = await Promise.all([mentorias(q, 100, agora), visualizacoesPorProduto(q.criador.id, 30, agora)]);
      return todas.sort((a, b) => (vistas.get(b.id) ?? 0) - (vistas.get(a.id) ?? 0)).slice(0, n);
    }
  }
}

/** Uma fileira resolvida (itens vazios = a tela não mostra: RN-136). */
export async function resolverFileira(q: QuemVe, f: FileiraVitrine, agora = new Date()): Promise<FileiraResolvida> {
  return {
    id: f.id,
    titulo: tituloComNome(f.titulo, q.usuario.nome),
    variante: varianteDoTipo(f.tipo),
    tag: f.tipo === "TOP10" ? "TOP 10" : undefined,
    itens: await paraFileira(q.criador.id, await itensDaFileira(q, f, agora)),
  };
}

// ------------------------------------------------------------------ destaque

/** Avisos do canto (só desktop): última novidade e a aula nº 1 do Top 10. */
async function avisos(q: QuemPede, agora: Date): Promise<DestaqueConfig["avisos"]> {
  const [[novidade], [primeira]] = await Promise.all([novidades(q, 1, agora), top10(q.criador.id, 1)]);
  if (!novidade && !primeira) return undefined;
  return { novidade: novidade ? `Novo: ${novidade.titulo}` : undefined, ranking: primeira ? { selo: "TOP 1", texto: primeira.titulo } : undefined };
}

type CursoDoAluno = NonNullable<Awaited<ReturnType<typeof cursoDoAluno>>>;

/** Linha meta + selo + "Continue de onde parou" a partir do curso do destaque. */
function sobreOCurso(c: CursoDoAluno) {
  const { produto, totais, proxima } = c;
  return {
    meta: [ROTULO_TIPO_PRODUTO[produto.tipo], totais.duracaoSeg > 0 ? duracaoCurta(totais.duracaoSeg) : ""].filter(Boolean),
    seloAuto: totais.aulas > 0 ? `${totais.aulas} ${totais.aulas === 1 ? "AULA" : "AULAS"}` : undefined,
    retomar: proxima?.rotulo.startsWith("Continuar") ? `Continue de onde parou: aula ${proxima.numero}.` : "",
  };
}

const slugDoHref = (href?: string) => href?.match(/^\/cursos\/([a-z0-9-]+)$/)?.[1];

/** PADRÃO (sem config publicada): o curso do "Continuar" (senão a matrícula mais recente; equipe: a novidade). */
async function destaquePadrao(q: QuemPede, agora: Date): Promise<DestaqueResolvido | null> {
  const cursos = q.membro.id ? await cursosDoAluno(q.criador.id, q.membro.id, agora) : [];
  const [continuar, novas] = await Promise.all([continuarAssistindo(q, 1, agora), novidades(q, 5, agora)]);
  const slug = cursos.find((c) => c.titulo === continuar[0]?.produtoTitulo)?.slug ?? cursos[0]?.slug ?? slugDoHref(novas.find((n) => n.tipo === "PRODUTO")?.href);
  const curso = slug ? await cursoDoAluno(q, slug, agora) : null;
  if (!curso) return null;
  const s = sobreOCurso(curso);
  const av = await avisos(q, agora);
  return {
    titulo: curso.produto.titulo,
    descricao: [curso.produto.descricao, s.retomar].filter(Boolean).join(" "),
    imagemUrl: (await urlDeImagemOuNula(q.criador.id, curso.produto.capa16x9Chave)) ?? undefined,
    meta: s.meta,
    badge: s.seloAuto,
    botaoPrincipal: { texto: "Assistir", href: curso.proxima?.href ?? `/cursos/${curso.produto.slug}` },
    botaoSecundario: { texto: "Mais informações", href: `/cursos/${curso.produto.slug}` },
    avisos: av,
    mostrarAvisos: !!av,
  };
}

/** Produtos e aulas alvo dos botões, DESTE criador e visíveis para quem pede (aluno: fora de rascunho). */
async function alvosDosBotoes(q: QuemPede, botoes: BotaoDestaque[]) {
  const ids = (acoes: BotaoDestaque["acao"][]) => botoes.filter((b) => acoes.includes(b.acao) && b.alvo).map((b) => b.alvo!);
  const visivel = (status: string) => ehEquipe(q) || status !== "RASCUNHO";
  const [ps, as] = await Promise.all([
    ids(["CURSO", "CONTINUAR"]).length
      ? db
          .select({ id: produtos.id, slug: produtos.slug, status: produtos.status })
          .from(produtos)
          .where(and(eq(produtos.criador_id, q.criador.id), vivos(produtos), inArray(produtos.id, ids(["CURSO", "CONTINUAR"]))))
      : [],
    ids(["AULA"]).length
      ? db
          .select({ id: produtos_modulos_aulas.id, slug: produtos.slug, status: produtos.status })
          .from(produtos_modulos_aulas)
          .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
          .innerJoin(produtos, eq(produtos.id, produtos_modulos.produto_id))
          .where(and(eq(produtos_modulos_aulas.criador_id, q.criador.id), vivos(produtos_modulos_aulas), vivos(produtos_modulos), vivos(produtos), inArray(produtos_modulos_aulas.id, ids(["AULA"]))))
      : [],
  ]);
  return {
    produtos: new Map(ps.filter((p) => visivel(p.status)).map((p) => [p.id, p.slug])),
    aulas: new Map(as.filter((a) => visivel(a.status)).map((a) => [a.id, a.slug])),
  };
}

/** Destaque configurado: botões resolvidos (alvo sumido = botão some), curso do destaque, imagem e selo. */
async function destaqueConfigurado(q: QuemPede, d: DestaqueVitrine, agora: Date): Promise<DestaqueResolvido> {
  const botoes = [d.botaoPrincipal, d.botaoSecundario].filter((b): b is BotaoDestaque => !!b);
  const alvos = await alvosDosBotoes(q, botoes);
  const slugDoBotao = (b: BotaoDestaque) => (b.alvo ? (b.acao === "AULA" ? alvos.aulas.get(b.alvo) : b.acao === "LINK" ? undefined : alvos.produtos.get(b.alvo)) : undefined);
  const slug = botoes.map(slugDoBotao).find(Boolean);
  const [curso, continuar, av, imagemChave] = await Promise.all([
    slug ? cursoDoAluno(q, slug, agora) : null,
    botoes.some((b) => b.acao === "CONTINUAR" && !b.alvo) ? continuarAssistindo(q, 1, agora) : [],
    d.mostrarAvisos ? avisos(q, agora) : undefined,
    d.imagemArquivoId
      ? db
          .select({ chave: arquivos.chave })
          .from(arquivos)
          .where(and(eq(arquivos.id, d.imagemArquivoId), eq(arquivos.criador_id, q.criador.id), vivos(arquivos)))
          .then((r) => r[0]?.chave ?? null)
      : null,
  ]);
  const proximaDoBotao = async (b: BotaoDestaque) => {
    const s = slugDoBotao(b);
    if (!s) return undefined;
    const c = s === slug ? curso : await cursoDoAluno(q, s, agora);
    return c?.proxima?.href ?? `/cursos/${s}`;
  };
  const href = async (b: BotaoDestaque): Promise<string | undefined> => {
    if (b.acao === "LINK") return b.alvo ?? undefined;
    if (b.acao === "AULA") return b.alvo && alvos.aulas.has(b.alvo) ? `/aula/${b.alvo}` : undefined;
    if (b.acao === "CURSO") return slugDoBotao(b) ? `/cursos/${slugDoBotao(b)}` : undefined;
    return b.alvo ? proximaDoBotao(b) : (continuar[0]?.href ?? "/continuar");
  };
  const links = (await Promise.all(botoes.map(async (b) => ({ texto: b.texto, href: await href(b) })))).filter((l): l is { texto: string; href: string } => !!l.href);
  const s = curso ? sobreOCurso(curso) : null;
  const retomar = d.botaoPrincipal.acao === "CONTINUAR" && s ? s.retomar : "";
  return {
    titulo: d.titulo,
    descricao: [d.descricao, retomar].filter(Boolean).join(" "),
    imagemUrl: (await urlDeImagemOuNula(q.criador.id, imagemChave ?? curso?.produto.capa16x9Chave ?? null)) ?? undefined,
    meta: s?.meta ?? [],
    badge: d.selo === null ? s?.seloAuto : d.selo || undefined,
    botaoPrincipal: links[0],
    botaoSecundario: links[1],
    avisos: av,
    mostrarAvisos: d.mostrarAvisos && !!av,
  };
}

export async function resolverDestaque(q: QuemPede, d: DestaqueVitrine | null, agora = new Date()): Promise<DestaqueResolvido | null> {
  return d ? destaqueConfigurado(q, d, agora) : destaquePadrao(q, agora);
}

// ------------------------------------------------------------------ vitrine inteira

export interface VitrineResolvida {
  destaque: DestaqueResolvido | null;
  /** Só as que têm itens, na ordem da config. */
  fileiras: FileiraResolvida[];
}

async function montar(q: QuemVe, config: ConfigVitrine | null, agora: Date): Promise<VitrineResolvida> {
  const [destaque, fileiras] = await Promise.all([
    resolverDestaque(q, config?.destaque ?? null, agora),
    fileirasVisiveis(q, config).then((fs) => Promise.all(fs.map((f) => resolverFileira(q, f, agora)))),
  ]);
  return { destaque, fileiras: fileiras.filter((f) => f.itens.length > 0) };
}

/** Vitrine do aluno a partir da versão PUBLICADA (cache por criador); sem publicação, o padrão. */
export async function vitrineDoAluno(q: QuemVe, agora = new Date()): Promise<VitrineResolvida> {
  return montar(q, await configPublicada(q.criador.id), agora);
}

/** Mesma montagem com o RASCUNHO — só equipe (a prévia mostra o que ainda não foi publicado). */
export async function previaDaVitrine(q: QuemVe, rascunho: ConfigVitrine, agora = new Date()): Promise<VitrineResolvida> {
  if (!ehEquipe(q)) throw new Error("Prévia da vitrine é só para a equipe.");
  return montar(q, rascunho, agora);
}
