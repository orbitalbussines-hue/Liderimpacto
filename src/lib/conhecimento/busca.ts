import "server-only";
import { and, desc, eq, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { avaliacaoPendenteSql } from "@/lib/avaliacoes/sql";
import { db } from "@/lib/db";
import type { FonteConhecimento, PapelCriador } from "@/lib/db/schema/_enums";
import {
  criadores_conhecimento_documentos as documentos,
  criadores_conhecimento_documentos_trechos as trechos,
  produtos,
  produtos_modulos as modulos,
  produtos_modulos_aulas as aulas,
} from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { preRequisitoCumpridoSql } from "@/lib/progresso/sql";
import { motivoDoBloqueio } from "@/lib/video/acesso";
import { consultaDaPergunta } from "./regras";

/**
 * RECUPERAÇÃO da base (ADR-0014 item 3, RN-191) — o filtro de acesso acontece AQUI, antes de
 * qualquer trecho chegar ao modelo:
 *
 * 1. SQL (grosso, garante que curso pago não vaza): trecho e documento vivos, documento incluído,
 *    aula/módulo/curso vivos; para ALUNO, curso publicado/não listado + módulo publicado +
 *    matrícula VALENDO agora. Texto da equipe sem curso vale para todos os membros.
 * 2. JS (fino, a MESMA regra do vídeo): `motivoDoBloqueio` por aula (liberação programada,
 *    avaliação que trava o módulo, pré-requisito). Equipe passa sempre.
 *
 * `produtos` = cursos em que o assistente aparece (null = todos). Ranking: `ts_rank_cd` sobre o
 * `tsvector` português sem acento, com OU entre os termos (basta 1 termo; palavras da pergunta que
 * não estão no texto, como "na prática", não eliminam o trecho; as vazias o Postgres tira), mais um
 * bônus quando o TÍTULO da fonte casa com a pergunta.
 */
const BONUS_TITULO = 0.1;

export interface QuemConsulta {
  /** Papel efetivo no criador do host (`null` = sem vínculo: nada de curso). */
  papel: PapelCriador | null;
  membroId: string | null;
}

export interface TrechoRecuperado {
  id: string;
  documentoId: string;
  fonte: FonteConhecimento;
  titulo: string;
  texto: string;
  inicioSeg: number | null;
  aulaId: string | null;
  produtoId: string | null;
  produtoTitulo: string | null;
  relevancia: number;
}

/** Candidatos lidos antes do filtro fino (folga para aulas travadas por liberação/pré-requisito). */
const CANDIDATOS = 40;

export async function recuperarTrechos(
  criadorId: string,
  quem: QuemConsulta,
  pergunta: string,
  opcoes: { produtos: readonly string[] | null; limite: number; porDocumento: number },
  agora: Date = new Date(),
): Promise<TrechoRecuperado[]> {
  const termos = consultaDaPergunta(pergunta);
  if (!termos) return [];
  const consulta = sql`to_tsquery('portuguese'::regconfig, li_sem_acento(${termos}))`;
  const produtoDoDoc = sql`coalesce(${modulos.produto_id}, ${documentos.produto_id})`;
  const equipe = quem.papel === "DONO" || quem.papel === "ADMIN";

  const condicoes: (SQL | undefined)[] = [
    eq(trechos.criador_id, criadorId),
    vivos(trechos),
    sql`${trechos.busca} @@ ${consulta}`,
    // Documento de aula: a aula e o módulo precisam existir vivos; de curso: o curso vivo.
    or(isNull(documentos.aula_id), isNotNull(modulos.id)),
    or(sql`${produtoDoDoc} is null`, isNotNull(produtos.id)),
  ];
  if (opcoes.produtos) {
    condicoes.push(opcoes.produtos.length ? or(isNull(produtos.id), inArray(produtos.id, [...opcoes.produtos])) : isNull(produtos.id));
  }
  if (!equipe) {
    const matricula = quem.membroId
      ? sql`exists (select 1 from produtos_matriculas pm
          where pm.produto_id = ${produtos.id} and pm.membro_id = ${quem.membroId}::uuid and pm.criador_id = ${criadorId}::uuid
            and pm.is_deleted = false and pm.status = 'ATIVA' and (pm.expira_em is null or pm.expira_em > ${agora}))`
      : sql`false`;
    condicoes.push(
      or(isNull(produtos.id), and(ne(produtos.status, "RASCUNHO"), or(isNull(modulos.id), eq(modulos.status, "PUBLICADO")), matricula)),
    );
  }

  const relevancia = sql<number>`(ts_rank_cd(${trechos.busca}, ${consulta})
    + case when to_tsvector('portuguese'::regconfig, li_sem_acento(${documentos.titulo})) @@ ${consulta} then ${sql.raw(String(BONUS_TITULO))} else 0 end)`;
  const linhas = await db
    .select({
      id: trechos.id,
      documentoId: documentos.id,
      fonte: documentos.fonte,
      titulo: documentos.titulo,
      texto: trechos.texto,
      inicioSeg: trechos.inicio_seg,
      aulaId: aulas.id,
      produtoId: produtos.id,
      produtoTitulo: produtos.titulo,
      relevancia,
      liberaEm: aulas.libera_em,
      statusModulo: modulos.status,
      statusProduto: produtos.status,
      preRequisitoCumprido: preRequisitoCumpridoSql(aulas.pre_requisito_aula_id, quem.membroId),
      avaliacaoPendente: avaliacaoPendenteSql(modulos.id, quem.membroId),
    })
    .from(trechos)
    .innerJoin(documentos, and(eq(documentos.id, trechos.documento_id), eq(documentos.criador_id, trechos.criador_id), vivos(documentos), eq(documentos.incluir, true)))
    .leftJoin(aulas, and(eq(aulas.id, documentos.aula_id), eq(aulas.criador_id, criadorId), vivos(aulas)))
    .leftJoin(modulos, and(eq(modulos.id, aulas.modulo_id), vivos(modulos)))
    .leftJoin(produtos, and(sql`${produtos.id} = ${produtoDoDoc}`, eq(produtos.criador_id, criadorId), vivos(produtos)))
    .where(and(...condicoes))
    .orderBy(desc(relevancia), trechos.id)
    .limit(CANDIDATOS);

  const porDoc = new Map<string, number>();
  const saida: TrechoRecuperado[] = [];
  for (const l of linhas) {
    if (l.aulaId && l.statusModulo && l.statusProduto) {
      // Matrícula já conferida no SQL para o aluno; aqui as travas da aula (mesma regra do vídeo).
      const motivo = motivoDoBloqueio(
        { papel: quem.papel, matriculaAtiva: true },
        { liberaEm: l.liberaEm, statusModulo: l.statusModulo, statusProduto: l.statusProduto, preRequisitoCumprido: l.preRequisitoCumprido, avaliacaoPendente: l.avaliacaoPendente },
        agora,
      );
      if (motivo) continue;
    }
    const n = porDoc.get(l.documentoId) ?? 0;
    if (n >= opcoes.porDocumento) continue;
    porDoc.set(l.documentoId, n + 1);
    saida.push({
      id: l.id,
      documentoId: l.documentoId,
      fonte: l.fonte,
      titulo: l.titulo,
      texto: l.texto,
      inicioSeg: l.inicioSeg,
      aulaId: l.aulaId,
      produtoId: l.produtoId,
      produtoTitulo: l.produtoTitulo,
      relevancia: Number(l.relevancia),
    });
    if (saida.length >= opcoes.limite) break;
  }
  return saida;
}
