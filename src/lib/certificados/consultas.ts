import "server-only";
import { and, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { urlDeLeitura } from "@/lib/armazenamento/cliente";
import { db } from "@/lib/db";
import type { SituacaoCertificado, SituacaoVersaoCertificado } from "@/lib/db/schema/_enums";
import {
  arquivos,
  criadores,
  criadores_certificados_modelos as modelos,
  criadores_membros,
  produtos,
  produtos_certificados as cert,
  produtos_certificados_versoes as versoes,
  produtos_matriculas,
  usuarios,
  type DadosCertificado,
} from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { progressoDosCursos } from "@/lib/progresso/consultas";
import type { QuemPede } from "@/lib/progresso/visao";
import { verificarEmissao } from "./emissao";
import { cargaHorariaTexto, codigoLegivel, MODELO_PADRAO, nomeDoPdf, normalizarCodigo } from "./regras";

/**
 * LEITURAS dos certificados (telas 9 e admin, verificação pública). Criador SEMPRE do host.
 * Formatos documentados em docs/back.md (passo 7).
 */

/** Última versão (qualquer situação) e última PRONTA de cada certificado. */
const ultimaVersao = sql<{ versao: number; situacao: SituacaoVersaoCertificado; dados: DadosCertificado } | null>`(
  select json_build_object('versao', v.versao, 'situacao', v.situacao, 'dados', v.dados) from produtos_certificados_versoes v
  where v.certificado_id = ${cert.id} and v.is_deleted = false order by v.versao desc limit 1)`;

export interface CertificadoEmitido {
  id: string;
  codigo: string;
  /** "K7M2X-9QP4H". */
  codigoLegivel: string;
  curso: { id: string; titulo: string; slug: string };
  situacao: SituacaoCertificado;
  emitidoEm: Date;
  revogadoEm: Date | null;
  /** Da última versão: o que a prévia do card mostra. */
  nome: string;
  titulo: string;
  texto: string;
  cargaHoraria: string;
  urlVerificacao: string;
  /** Última versão do PDF (PRONTA = "Baixar PDF" via `acaoBaixarCertificado`; PENDENTE = "Gerando..."). */
  pdf: { versao: number; situacao: SituacaoVersaoCertificado } | null;
}

export interface CertificadoBloqueado {
  curso: { id: string; titulo: string; slug: string };
  /** Progresso do curso (0–100). */
  percentual: number;
  aulasRestantes: number;
  /** Avaliações obrigatórias ainda não aprovadas. */
  avaliacoesPendentes: { id: string; titulo: string; href: string }[];
}

/**
 * Tela 9: emitidos (inclusive revogados, com a situação) + bloqueados (cursos matriculados sem
 * certificado: progresso e o que falta). Antes de ler, emite o que já estiver elegível sem ter
 * passado por um evento (ex.: avaliação obrigatória despublicada depois da conclusão).
 */
export async function certificadosDoAluno(q: QuemPede): Promise<{ emitidos: CertificadoEmitido[]; bloqueados: CertificadoBloqueado[] }> {
  const membro = q.membro.id;
  if (!membro) return { emitidos: [], bloqueados: [] };
  const cursos = await db
    .select({ id: produtos.id, titulo: produtos.titulo, slug: produtos.slug, concluida: sql<boolean>`${produtos_matriculas.concluida_em} is not null` })
    .from(produtos_matriculas)
    .innerJoin(produtos, eq(produtos.id, produtos_matriculas.produto_id))
    .where(
      and(
        eq(produtos_matriculas.criador_id, q.criador.id),
        eq(produtos_matriculas.membro_id, membro),
        vivos(produtos_matriculas),
        ne(produtos_matriculas.status, "CANCELADA"),
        vivos(produtos),
        ne(produtos.status, "RASCUNHO"),
      ),
    );
  const existentes = new Set(
    (await db.select({ p: cert.produto_id }).from(cert).where(and(eq(cert.criador_id, q.criador.id), eq(cert.membro_id, membro), vivos(cert)))).map((c) => c.p),
  );
  for (const c of cursos) if (c.concluida && !existentes.has(c.id)) await verificarEmissao(q.criador.id, membro, c.id);

  const linhas = await db
    .select({
      id: cert.id,
      codigo: cert.codigo,
      situacao: cert.situacao,
      emitidoEm: cert.emitido_em,
      revogadoEm: cert.revogado_em,
      produtoId: produtos.id,
      produtoTitulo: produtos.titulo,
      produtoSlug: produtos.slug,
      ultima: ultimaVersao,
    })
    .from(cert)
    .innerJoin(produtos, eq(produtos.id, cert.produto_id))
    .where(and(eq(cert.criador_id, q.criador.id), eq(cert.membro_id, membro), vivos(cert)))
    .orderBy(desc(cert.emitido_em));
  const emitidos = linhas.map((l): CertificadoEmitido => {
    const d = l.ultima?.dados;
    return {
      id: l.id,
      codigo: l.codigo,
      codigoLegivel: codigoLegivel(l.codigo),
      curso: { id: l.produtoId, titulo: l.produtoTitulo, slug: l.produtoSlug },
      situacao: l.situacao,
      emitidoEm: l.emitidoEm,
      revogadoEm: l.revogadoEm,
      nome: d?.nome ?? "",
      titulo: d?.titulo ?? MODELO_PADRAO.titulo,
      texto: d?.texto ?? "",
      cargaHoraria: cargaHorariaTexto(d?.cargaHorariaSeg ?? 0),
      urlVerificacao: d?.urlVerificacao ?? "",
      pdf: l.ultima ? { versao: l.ultima.versao, situacao: l.ultima.situacao } : null,
    };
  });

  const comCertificado = new Set(linhas.map((l) => l.produtoId));
  const semCertificado = cursos.filter((c) => !comCertificado.has(c.id));
  const progresso = await progressoDosCursos(q, semCertificado.map((c) => c.id));
  const pendentes = semCertificado.length
    ? await db.execute<{ id: string; titulo: string; produto_id: string }>(sql`
        select av.id, av.titulo, av.produto_id from produtos_avaliacoes av left join produtos_modulos mo on mo.id = av.modulo_id
        where av.criador_id = ${q.criador.id}::uuid and av.produto_id in (${sql.join(semCertificado.map((c) => sql`${c.id}::uuid`), sql`, `)})
          and av.obrigatoria_para_certificado and av.status = 'PUBLICADA' and av.is_deleted = false and (av.modulo_id is null or mo.is_deleted = false)
          and not exists (select 1 from produtos_avaliacoes_tentativas t where t.avaliacao_id = av.id and t.membro_id = ${membro}::uuid and t.aprovada and t.is_deleted = false)
        order by av.created_at`)
    : { rows: [] };
  const bloqueados = semCertificado.map((c): CertificadoBloqueado => {
    const p = progresso.get(c.id) ?? { concluidas: 0, total: 0, percentual: 0 };
    return {
      curso: { id: c.id, titulo: c.titulo, slug: c.slug },
      percentual: p.percentual,
      aulasRestantes: Math.max(0, p.total - p.concluidas),
      avaliacoesPendentes: pendentes.rows.filter((a) => a.produto_id === c.id).map((a) => ({ id: a.id, titulo: a.titulo, href: `/avaliacoes/${a.id}` })),
    };
  });
  return { emitidos, bloqueados };
}

/** URL assinada (5 min) da ÚLTIMA versão PRONTA. `null` = revogado, sem PDF pronto ou de outro criador. */
async function urlDaUltimaPronta(criadorId: string, filtro: SQL): Promise<{ url: string; versao: number } | null> {
  const [v] = await db
    .select({ chave: arquivos.chave, versao: versoes.versao, codigo: cert.codigo })
    .from(cert)
    .innerJoin(versoes, and(eq(versoes.certificado_id, cert.id), eq(versoes.situacao, "PRONTA"), vivos(versoes)))
    .innerJoin(arquivos, and(eq(arquivos.id, versoes.arquivo_id), vivos(arquivos)))
    .where(and(eq(cert.criador_id, criadorId), vivos(cert), eq(cert.situacao, "EMITIDO"), filtro))
    .orderBy(desc(versoes.versao))
    .limit(1);
  if (!v) return null;
  return { url: await urlDeLeitura({ bucket: "arquivos", criadorId, chave: v.chave, nomeDownload: nomeDoPdf(v.codigo, v.versao) }), versao: v.versao };
}

/** Download pelo id (aluno dono ou equipe — quem chama confere). */
export const urlDoPdf = (criadorId: string, certificadoId: string) => urlDaUltimaPronta(criadorId, eq(cert.id, certificadoId));

/** Download PÚBLICO pelo código (rota `/certificado/[codigo]`): só não revogado, deste host. */
export async function urlDoPdfPorCodigo(criadorId: string, codigoDigitado: string) {
  const codigo = normalizarCodigo(codigoDigitado);
  return codigo ? urlDaUltimaPronta(criadorId, eq(cert.codigo, codigo)) : null;
}

export interface VerificacaoPublica {
  situacao: "VALIDO" | "REVOGADO";
  codigo: string;
  codigoLegivel: string;
  nome: string;
  curso: string;
  cargaHoraria: string;
  concluidoEm: Date;
  emitidoEm: Date;
  revogadoEm: Date | null;
  criador: string;
  /** Há PDF pronto para baixar (só quando VALIDO). */
  temPdf: boolean;
}

/**
 * Verificação PÚBLICA (sem sessão): só o que o certificado impresso já mostra — nome, curso,
 * carga, datas, criador e situação. Nunca e-mail, ids, motivo da revogação ou dados da conta.
 * Código de OUTRO criador = `null` (404 neste host).
 */
export async function verificarPublico(criadorId: string, codigoDigitado: string): Promise<VerificacaoPublica | null> {
  const codigo = normalizarCodigo(codigoDigitado);
  if (!codigo) return null;
  const [c] = await db
    .select({
      situacao: cert.situacao,
      emitidoEm: cert.emitido_em,
      revogadoEm: cert.revogado_em,
      criador: criadores.nome,
      ultima: ultimaVersao,
      temPdf: sql<boolean>`exists (select 1 from produtos_certificados_versoes v where v.certificado_id = ${cert.id} and v.situacao = 'PRONTA' and v.is_deleted = false)`,
    })
    .from(cert)
    .innerJoin(criadores, eq(criadores.id, cert.criador_id))
    .where(and(eq(cert.codigo, codigo), eq(cert.criador_id, criadorId), vivos(cert)));
  if (!c?.ultima) return null;
  const d = c.ultima.dados;
  return {
    situacao: c.situacao === "EMITIDO" ? "VALIDO" : "REVOGADO",
    codigo,
    codigoLegivel: codigoLegivel(codigo),
    nome: d.nome,
    curso: d.curso,
    cargaHoraria: cargaHorariaTexto(d.cargaHorariaSeg),
    concluidoEm: new Date(d.concluidoEm),
    emitidoEm: c.emitidoEm,
    revogadoEm: c.revogadoEm,
    criador: c.criador,
    temPdf: c.situacao === "EMITIDO" && c.temPdf,
  };
}

// ------------------------------------------------------------------ admin

/** `%` e `_` digitados viram literais no ILIKE. */
const curinga = (texto: string) => `%${texto.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;

export interface FiltrosCertificados {
  busca?: string;
  produtoId?: string;
  situacao?: SituacaoCertificado;
  pagina: number;
  porPagina: number;
}

/** Lista "Certificados" do admin (busca por nome, e-mail ou código) + resumo do cabeçalho. */
export async function certificadosDoAdmin(criadorId: string, f: FiltrosCertificados) {
  const condicoes: SQL[] = [eq(cert.criador_id, criadorId), vivos(cert)];
  if (f.busca) {
    const codigo = normalizarCodigo(f.busca);
    condicoes.push(or(ilike(usuarios.nome, curinga(f.busca)), ilike(usuarios.email, curinga(f.busca)), codigo ? eq(cert.codigo, codigo) : sql`false`)!);
  }
  if (f.produtoId) condicoes.push(eq(cert.produto_id, f.produtoId));
  if (f.situacao) condicoes.push(eq(cert.situacao, f.situacao));
  const de = () =>
    db
      .select({
        id: cert.id,
        codigo: cert.codigo,
        situacao: cert.situacao,
        emitidoEm: cert.emitido_em,
        revogadoEm: cert.revogado_em,
        motivoRevogacao: cert.motivo_revogacao,
        versao: cert.updated_at,
        nome: usuarios.nome,
        email: usuarios.email,
        imagem: usuarios.imagem,
        produtoId: produtos.id,
        curso: produtos.titulo,
        ultima: ultimaVersao,
        total: sql<number>`count(*) over ()::int`,
      })
      .from(cert)
      .innerJoin(criadores_membros, eq(criadores_membros.id, cert.membro_id))
      .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
      .innerJoin(produtos, eq(produtos.id, cert.produto_id));
  const linhas = await de()
    .where(and(...condicoes))
    .orderBy(desc(cert.emitido_em), desc(cert.id))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina);
  const [resumo] = await db
    .select({
      emitidos: sql<number>`count(*) filter (where ${cert.situacao} = 'EMITIDO')::int`,
      revogados: sql<number>`count(*) filter (where ${cert.situacao} = 'REVOGADO')::int`,
      ultimos30: sql<number>`count(*) filter (where ${cert.emitido_em} > now() - interval '30 days')::int`,
      pdfPendentes: sql<number>`count(*) filter (where exists (select 1 from produtos_certificados_versoes v where v.certificado_id = ${cert.id} and v.situacao <> 'PRONTA' and v.is_deleted = false))::int`,
    })
    .from(cert)
    .where(and(eq(cert.criador_id, criadorId), vivos(cert)));
  return {
    resumo,
    total: linhas[0]?.total ?? 0,
    linhas: linhas.map((l) => ({
      id: l.id,
      codigo: l.codigo,
      codigoLegivel: codigoLegivel(l.codigo),
      situacao: l.situacao,
      emitidoEm: l.emitidoEm,
      revogadoEm: l.revogadoEm,
      motivoRevogacao: l.motivoRevogacao,
      /** Trava de `acaoRevogarCertificado`. */
      versao: l.versao.toISOString(),
      aluno: { nome: l.nome, email: l.email, imagem: l.imagem },
      curso: { id: l.produtoId, titulo: l.curso },
      pdf: l.ultima ? { versao: l.ultima.versao, situacao: l.ultima.situacao } : null,
    })),
  };
}

/** Histórico de versões do PDF de um certificado (admin). */
export async function versoesDoCertificado(criadorId: string, certificadoId: string) {
  return db
    .select({ versao: versoes.versao, situacao: versoes.situacao, geradaEm: versoes.gerada_em, erro: versoes.erro, pedidaEm: versoes.created_at, tamanhoBytes: arquivos.tamanho_bytes })
    .from(versoes)
    .leftJoin(arquivos, eq(arquivos.id, versoes.arquivo_id))
    .where(and(eq(versoes.criador_id, criadorId), eq(versoes.certificado_id, certificadoId), vivos(versoes)))
    .orderBy(desc(versoes.versao));
}

/**
 * Modelo para o editor: o do produto, senão o padrão do criador, senão o embutido (RN-127).
 * `versao` nula = ainda não existe linha para este alvo (salvar cria).
 */
export async function modeloDeCertificado(criadorId: string, produtoId: string | null) {
  const lista = await db
    .select()
    .from(modelos)
    .where(and(eq(modelos.criador_id, criadorId), vivos(modelos), produtoId ? or(eq(modelos.produto_id, produtoId), sql`${modelos.produto_id} is null`) : sql`${modelos.produto_id} is null`));
  const proprio = lista.find((m) => m.produto_id === produtoId);
  const herdado = proprio ?? lista.find((m) => m.produto_id === null);
  const [cri] = await db.select({ nome: criadores.nome }).from(criadores).where(eq(criadores.id, criadorId));
  return {
    produtoId,
    versao: proprio ? proprio.updated_at.toISOString() : null,
    origem: proprio ? ("PROPRIO" as const) : herdado ? ("PADRAO_DO_CRIADOR" as const) : ("EMBUTIDO" as const),
    titulo: herdado?.titulo ?? MODELO_PADRAO.titulo,
    texto: herdado?.texto ?? MODELO_PADRAO.texto,
    assinaturaNome: herdado?.assinatura_nome ?? cri?.nome ?? "",
    assinaturaCargo: herdado ? herdado.assinatura_cargo : MODELO_PADRAO.assinaturaCargo,
    cor: herdado?.cor ?? null,
  };
}

/** Produtos que já têm modelo próprio (lista do editor). */
export async function produtosComModelo(criadorId: string, produtoIds: readonly string[]): Promise<Set<string>> {
  if (!produtoIds.length) return new Set();
  const l = await db
    .select({ p: modelos.produto_id })
    .from(modelos)
    .where(and(eq(modelos.criador_id, criadorId), vivos(modelos), inArray(modelos.produto_id, [...produtoIds])));
  return new Set(l.map((x) => x.p!));
}
