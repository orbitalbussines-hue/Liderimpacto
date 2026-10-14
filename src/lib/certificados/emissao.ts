import "server-only";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { urlDaPlataforma } from "@/lib/criador/area";
import { db, type Transacao } from "@/lib/db";
import {
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
import { MSG_COLISAO, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { enfileirarCertificadoComPrazo } from "./fila";
import { cargaHorariaTexto, corDoCertificado, dataPorExtenso, gerarCodigo, MODELO_PADRAO, preencherTexto, urlDeVerificacao } from "./regras";

/**
 * Emissão de certificados (RN-127, RN-128). Condição: matrícula viva, não cancelada, CONCLUÍDA
 * (todas as aulas publicadas, `concluida_em`) E aprovação em todas as avaliações PUBLICADAS
 * `obrigatoria_para_certificado` do produto. Emissão automática e IDEMPOTENTE: o índice único
 * (membro, produto) + `on conflict do nothing` faz duas conclusões simultâneas darem UM
 * certificado. Cada versão do PDF congela os dados e vai para a fila depois do commit.
 */

/** Matrícula concluída + obrigatórias aprovadas? Devolve a matrícula, ou `null`. */
export async function elegivel(criadorId: string, membroId: string, produtoId: string, exec: Transacao | typeof db = db) {
  const [m] = await exec
    .select({ id: produtos_matriculas.id, concluidaEm: produtos_matriculas.concluida_em })
    .from(produtos_matriculas)
    .where(
      and(
        eq(produtos_matriculas.criador_id, criadorId),
        eq(produtos_matriculas.membro_id, membroId),
        eq(produtos_matriculas.produto_id, produtoId),
        vivos(produtos_matriculas),
        ne(produtos_matriculas.status, "CANCELADA"),
        isNotNull(produtos_matriculas.concluida_em),
        sql`not exists (select 1 from produtos_avaliacoes av
          left join produtos_modulos mo on mo.id = av.modulo_id
          where av.produto_id = ${produtoId}::uuid and av.obrigatoria_para_certificado and av.status = 'PUBLICADA' and av.is_deleted = false
            and (av.modulo_id is null or mo.is_deleted = false)
            and not exists (select 1 from produtos_avaliacoes_tentativas t where t.avaliacao_id = av.id and t.membro_id = ${membroId}::uuid and t.aprovada and t.is_deleted = false))`,
      ),
    );
  return m ? { matriculaId: m.id, concluidaEm: m.concluidaEm! } : null;
}

/** Dados congelados de uma versão, lidos AGORA (nome, curso, carga, modelo, cor, URL). */
export async function dadosDaVersao(tx: Transacao, criadorId: string, c: { produtoId: string; membroId: string; codigo: string; concluidaEm: Date }): Promise<DadosCertificado> {
  const [base] = await tx
    .select({
      nome: usuarios.nome,
      curso: produtos.titulo,
      corCurso: produtos.cor_marca,
      criador: criadores.nome,
      criadorSlug: criadores.slug,
      corCriador: criadores.cor_marca,
      cargaSeg: sql<number>`(select coalesce(sum(a.duracao_seg), 0)::int from produtos_modulos_aulas a join produtos_modulos mo on mo.id = a.modulo_id
        where mo.produto_id = ${produtos.id} and mo.status = 'PUBLICADO' and mo.is_deleted = false and a.is_deleted = false)`,
    })
    .from(produtos)
    .innerJoin(criadores, eq(criadores.id, produtos.criador_id))
    .innerJoin(criadores_membros, and(eq(criadores_membros.id, c.membroId), eq(criadores_membros.criador_id, criadorId)))
    .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .where(and(eq(produtos.id, c.produtoId), eq(produtos.criador_id, criadorId)));
  if (!base) throw new Error("certificado sem produto/membro deste criador");
  const lista = await tx
    .select()
    .from(modelos)
    .where(and(eq(modelos.criador_id, criadorId), vivos(modelos), sql`(${modelos.produto_id} = ${c.produtoId}::uuid or ${modelos.produto_id} is null)`));
  const modelo = lista.find((m) => m.produto_id === c.produtoId) ?? lista.find((m) => m.produto_id === null);
  const variaveis = { nome: base.nome, curso: base.curso, carga_horaria: cargaHorariaTexto(base.cargaSeg), data: dataPorExtenso(c.concluidaEm) };
  return {
    nome: base.nome,
    curso: base.curso,
    cargaHorariaSeg: base.cargaSeg,
    concluidoEm: c.concluidaEm.toISOString(),
    titulo: modelo?.titulo ?? MODELO_PADRAO.titulo,
    texto: preencherTexto(modelo?.texto ?? MODELO_PADRAO.texto, variaveis),
    assinaturaNome: modelo?.assinatura_nome ?? base.criador,
    assinaturaCargo: modelo ? modelo.assinatura_cargo : MODELO_PADRAO.assinaturaCargo,
    cor: corDoCertificado(modelo?.cor, base.corCurso, base.corCriador),
    criador: base.criador,
    codigo: c.codigo,
    urlVerificacao: urlDeVerificacao(urlDaPlataforma(), base.criadorSlug, c.codigo),
  };
}

/** Cria a versão N (PENDENTE) com os dados de agora. Quem chama enfileira DEPOIS do commit. */
async function novaVersao(tx: Transacao, criadorId: string, c: { id: string; produtoId: string; membroId: string; codigo: string; concluidaEm: Date }, autorId: string) {
  const [{ proxima }] = await tx
    .select({ proxima: sql<number>`coalesce(max(${versoes.versao}), 0)::int + 1` })
    .from(versoes)
    .where(eq(versoes.certificado_id, c.id));
  const dados = await dadosDaVersao(tx, criadorId, c);
  const [v] = await tx
    .insert(versoes)
    .values({ criador_id: criadorId, certificado_id: c.id, versao: proxima, dados, modified_by: autorId })
    .returning({ id: versoes.id, versao: versoes.versao });
  return v;
}

export interface Emissao {
  certificadoId: string;
  /** `true` = emitido nesta chamada (senão já existia). */
  novo: boolean;
}

/**
 * Emite se ainda não existe (idempotente). `autorId` nulo = sistema (conclusão/aprovação): a linha
 * fica com `modified_by` = a pessoa certificada e a trilha com `user_id` nulo.
 */
export async function emitir(criadorId: string, membroId: string, produtoId: string, autorId: string | null = null): Promise<Emissao | null> {
  const r = await db.transaction(async (tx) => {
    const e = await elegivel(criadorId, membroId, produtoId, tx);
    if (!e) return null;
    const [pessoa] = await tx.select({ usuarioId: criadores_membros.usuario_id }).from(criadores_membros).where(eq(criadores_membros.id, membroId));
    const autor = autorId ?? pessoa.usuarioId;
    const codigo = gerarCodigo();
    const [c] = await tx
      .insert(cert)
      .values({ criador_id: criadorId, produto_id: produtoId, membro_id: membroId, matricula_id: e.matriculaId, codigo, modified_by: autor })
      .onConflictDoNothing({ target: [cert.membro_id, cert.produto_id], where: sql`is_deleted = false` })
      .returning({ id: cert.id });
    if (!c) {
      const [existente] = await tx.select({ id: cert.id }).from(cert).where(and(eq(cert.membro_id, membroId), eq(cert.produto_id, produtoId), vivos(cert)));
      return { certificadoId: existente.id, novo: false, versaoId: null };
    }
    const v = await novaVersao(tx, criadorId, { id: c.id, produtoId, membroId, codigo, concluidaEm: e.concluidaEm }, autor);
    await registrarAuditoria(tx, {
      userId: autorId,
      criadorId,
      acao: "criar",
      tabela: "produtos_certificados",
      registroId: c.id,
      detalhes: `Certificado ${codigo} emitido (membro ${membroId}, produto ${produtoId}); PDF v1 na fila`,
      dadosNovos: { codigo, produto_id: produtoId, membro_id: membroId, matricula_id: e.matriculaId },
    });
    return { certificadoId: c.id, novo: true, versaoId: v.id };
  });
  if (!r) return null;
  if (r.versaoId) await enfileirarCertificadoComPrazo(r.versaoId);
  return { certificadoId: r.certificadoId, novo: r.novo };
}

/**
 * Ponto único chamado na conclusão da matrícula (progresso), na aprovação (tentativa) e na tela de
 * certificados do aluno (recupera quem ficou elegível sem evento, ex.: obrigatória despublicada).
 * Nunca derruba quem chamou: erro vai para o log e a próxima chamada tenta de novo.
 */
export async function verificarEmissao(criadorId: string, membroId: string, produtoId: string): Promise<Emissao | null> {
  try {
    return await emitir(criadorId, membroId, produtoId);
  } catch (e) {
    console.error("CRITICAL [certificados] falha ao verificar emissão:", { criadorId, membroId, produtoId }, e);
    return null;
  }
}

/** Próxima versão do PDF, mesmo sem mudança nos dados (regra da base: v1, v2...). */
export async function gerarNovaVersao(criadorId: string, certificadoId: string, autorId: string): Promise<{ versaoId: string; versao: number; enfileirado: boolean }> {
  const v = await db.transaction(async (tx) => {
    const [c] = await tx
      .select({ id: cert.id, produtoId: cert.produto_id, membroId: cert.membro_id, codigo: cert.codigo, situacao: cert.situacao, matriculaId: cert.matricula_id })
      .from(cert)
      .where(and(eq(cert.id, certificadoId), eq(cert.criador_id, criadorId), vivos(cert)))
      .for("update");
    if (!c) throw new ErroDeNegocio("Certificado não encontrado.");
    if (c.situacao === "REVOGADO") throw new ErroDeNegocio("Certificado revogado não gera PDF.");
    const [m] = await tx.select({ concluidaEm: produtos_matriculas.concluida_em }).from(produtos_matriculas).where(eq(produtos_matriculas.id, c.matriculaId));
    const nova = await novaVersao(tx, criadorId, { ...c, concluidaEm: m?.concluidaEm ?? new Date() }, autorId);
    await registrarAuditoria(tx, {
      userId: autorId,
      criadorId,
      acao: "criar",
      tabela: "produtos_certificados_versoes",
      registroId: nova.id,
      detalhes: `Nova versão v${nova.versao} do PDF do certificado ${c.codigo} na fila`,
      dadosNovos: { certificado_id: c.id, versao: nova.versao },
    });
    return nova;
  });
  return { versaoId: v.id, versao: v.versao, enfileirado: await enfileirarCertificadoComPrazo(v.id) };
}

/** Revoga (trava pela versão da linha): a verificação pública passa a dizer "revogado". */
export async function revogar(e: { criadorId: string; certificadoId: string; versao: Date; motivo: string; autorId: string }): Promise<{ versao: string }> {
  return db.transaction(async (tx) => {
    const agora = new Date();
    const [c] = await tx
      .update(cert)
      .set({ situacao: "REVOGADO", revogado_em: agora, motivo_revogacao: e.motivo, updated_at: agora, modified_by: e.autorId })
      .where(and(travaDeColisao(cert, e.certificadoId, e.versao), eq(cert.criador_id, e.criadorId), eq(cert.situacao, "EMITIDO")))
      .returning({ codigo: cert.codigo, updated_at: cert.updated_at });
    if (!c) throw new ErroDeNegocio(MSG_COLISAO);
    await registrarAuditoria(tx, {
      userId: e.autorId,
      criadorId: e.criadorId,
      acao: "atualizar",
      tabela: "produtos_certificados",
      registroId: e.certificadoId,
      detalhes: `Revogou o certificado ${c.codigo}: ${e.motivo}`,
      dadosAnteriores: { situacao: "EMITIDO" },
      dadosNovos: { situacao: "REVOGADO", motivo_revogacao: e.motivo },
    });
    return { versao: c.updated_at.toISOString() };
  });
}
