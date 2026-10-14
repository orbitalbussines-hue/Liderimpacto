"use server";

import { and, eq, isNull } from "drizzle-orm";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE, TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { urlDoPdf } from "@/lib/certificados/consultas";
import { gerarNovaVersao, revogar } from "@/lib/certificados/emissao";
import { db } from "@/lib/db";
import { criadores_certificados_modelos as modelos, produtos, produtos_certificados as cert } from "@/lib/db/schema";
import { MSG_COLISAO, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { certificadoIdSchema, modeloCertificadoSchema, revogarCertificadoSchema } from "@/lib/validators/avaliacoes";

/**
 * Certificados (RN-127 a RN-129). Equipe (DONO e ADMIN): modelo, nova versão do PDF, revogar.
 * Baixar: o próprio aluno (só o dele) ou a equipe. Emissão NÃO tem action: é automática
 * (src/lib/certificados/emissao.ts). Criador sempre do HOST.
 */

/** Cria ou edita o modelo padrão (`produtoId` nulo) ou o de um curso. `versao` nula = criar. */
export async function acaoSalvarModeloCertificado(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = modeloCertificadoSchema.parse(entrada);
    const campos = { titulo: e.titulo, texto: e.texto, assinatura_nome: e.assinaturaNome, assinatura_cargo: e.assinaturaCargo, cor: e.cor };
    return db.transaction(async (tx) => {
      if (e.produtoId) {
        const [p] = await tx.select({ id: produtos.id }).from(produtos).where(and(eq(produtos.id, e.produtoId), eq(produtos.criador_id, criador.id), vivos(produtos)));
        if (!p) throw new ErroDeNegocio("Curso não encontrado nesta área.");
      }
      const alvo = and(eq(modelos.criador_id, criador.id), e.produtoId ? eq(modelos.produto_id, e.produtoId) : isNull(modelos.produto_id), vivos(modelos));
      const [atual] = await tx.select().from(modelos).where(alvo).for("update");
      if (!e.versao) {
        if (atual) throw new ErroDeNegocio(MSG_COLISAO);
        const [m] = await tx
          .insert(modelos)
          .values({ criador_id: criador.id, produto_id: e.produtoId, ...campos, modified_by: usuario.id })
          .returning({ id: modelos.id, updated_at: modelos.updated_at });
        await registrarAuditoria(tx, {
          userId: usuario.id,
          criadorId: criador.id,
          acao: "criar",
          tabela: "criadores_certificados_modelos",
          registroId: m.id,
          detalhes: e.produtoId ? `Criou o modelo de certificado do curso ${e.produtoId}` : "Criou o modelo padrão de certificado",
          dadosNovos: campos,
        });
        return { versao: m.updated_at.toISOString() };
      }
      if (!atual) throw new ErroDeNegocio(MSG_COLISAO);
      const [m] = await tx
        .update(modelos)
        .set({ ...campos, updated_at: new Date(), modified_by: usuario.id })
        .where(and(travaDeColisao(modelos, atual.id, e.versao), eq(modelos.criador_id, criador.id)))
        .returning({ updated_at: modelos.updated_at });
      if (!m) throw new ErroDeNegocio(MSG_COLISAO);
      await registrarAuditoria(tx, {
        userId: usuario.id,
        criadorId: criador.id,
        acao: "atualizar",
        tabela: "criadores_certificados_modelos",
        registroId: atual.id,
        detalhes: "Editou o modelo de certificado (vale para os próximos PDFs; os já gerados ficam como estão)",
        dadosAnteriores: { titulo: atual.titulo, texto: atual.texto, assinatura_nome: atual.assinatura_nome, assinatura_cargo: atual.assinatura_cargo, cor: atual.cor },
        dadosNovos: campos,
      });
      return { versao: m.updated_at.toISOString() };
    });
  });
}

/** Nova versão do PDF (v2, v3...) com os dados de agora; mesmo sem mudança (regra da base). */
export async function acaoGerarNovaVersaoCertificado(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const { certificadoId } = certificadoIdSchema.parse(entrada);
    return gerarNovaVersao(criador.id, certificadoId, usuario.id);
  });
}

/** Revoga com motivo (modal block na tela). A verificação pública passa a dizer "revogado". */
export async function acaoRevogarCertificado(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = revogarCertificadoSchema.parse(entrada);
    return revogar({ criadorId: criador.id, certificadoId: e.certificadoId, versao: e.versao, motivo: e.motivo, autorId: usuario.id });
  });
}

/** Link de 5 min da última versão PRONTA: `{ url, versao }`. Aluno só o próprio; revogado não baixa. */
export async function acaoBaixarCertificado(entrada: unknown) {
  return executar(async () => {
    const { criador, membro } = await exigirMembro(TODOS_OS_MEMBROS);
    const { certificadoId } = certificadoIdSchema.parse(entrada);
    if (membro.papel === "ALUNO") {
      const [c] = await db.select({ id: cert.id }).from(cert).where(and(eq(cert.id, certificadoId), eq(cert.criador_id, criador.id), eq(cert.membro_id, membro.id!), vivos(cert)));
      if (!c) throw new ErroDeNegocio("Certificado não encontrado.");
    }
    const r = await urlDoPdf(criador.id, certificadoId);
    if (!r) throw new ErroDeNegocio("PDF indisponível: o certificado foi revogado ou o arquivo ainda está sendo gerado.");
    return r;
  });
}
