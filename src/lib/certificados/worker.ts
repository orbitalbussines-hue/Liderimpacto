import "server-only";
import { and, eq } from "drizzle-orm";
import { gravarObjeto } from "@/lib/armazenamento/cliente";
import { chaveDoCriador } from "@/lib/armazenamento/regras";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db } from "@/lib/db";
import { arquivos, produtos_certificados as cert, produtos_certificados_versoes as versoes } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { gerarPdfCertificado } from "./pdf";
import { nomeDoPdf } from "./regras";

/**
 * Um job da fila `certificados`: desenha o PDF da versão (dados congelados), sobe no bucket de
 * arquivos em `criadores/<criador>/certificados/<certificado>/v<N>.pdf` e marca a versão PRONTA
 * com o registro em `arquivos` (finalidade CERTIFICADO). Idempotente: versão já PRONTA não refaz;
 * refazer depois de um upload que deu certo reaproveita o mesmo objeto/registro (chave fixa).
 */

export type ResultadoJobCertificado = "pronta" | "ja-pronta" | "ignorada";

export const chaveDoPdf = (criadorId: string, certificadoId: string, versao: number) => chaveDoCriador(criadorId, "certificados", certificadoId, `v${versao}.pdf`);

export async function processarVersao(versaoId: string): Promise<ResultadoJobCertificado> {
  const [v] = await db
    .select({ id: versoes.id, criadorId: versoes.criador_id, certificadoId: versoes.certificado_id, versao: versoes.versao, situacao: versoes.situacao, dados: versoes.dados, autor: versoes.modified_by })
    .from(versoes)
    .innerJoin(cert, eq(cert.id, versoes.certificado_id))
    .where(and(eq(versoes.id, versaoId), vivos(versoes), vivos(cert)));
  if (!v) return "ignorada";
  if (v.situacao === "PRONTA") return "ja-pronta";
  const pdf = await gerarPdfCertificado(v.dados);
  const chave = chaveDoPdf(v.criadorId, v.certificadoId, v.versao);
  await gravarObjeto({ bucket: "arquivos", criadorId: v.criadorId, chave, corpo: Buffer.from(pdf), mime: "application/pdf", tamanho: pdf.byteLength, cacheControl: "private, max-age=0" });
  await db.transaction(async (tx) => {
    const [existente] = await tx.select({ id: arquivos.id }).from(arquivos).where(and(eq(arquivos.chave, chave), vivos(arquivos)));
    const arquivoId =
      existente?.id ??
      (
        await tx
          .insert(arquivos)
          .values({
            criador_id: v.criadorId,
            chave,
            finalidade: "CERTIFICADO",
            nome_original: nomeDoPdf(v.dados.codigo, v.versao),
            mime: "application/pdf",
            tamanho_bytes: pdf.byteLength,
            status: "DISPONIVEL",
            modified_by: v.autor,
          })
          .returning({ id: arquivos.id })
      )[0].id;
    if (existente) await tx.update(arquivos).set({ tamanho_bytes: pdf.byteLength, updated_at: new Date(), modified_by: v.autor }).where(eq(arquivos.id, existente.id));
    await tx
      .update(versoes)
      .set({ situacao: "PRONTA", arquivo_id: arquivoId, gerada_em: new Date(), erro: null, updated_at: new Date() })
      .where(eq(versoes.id, v.id));
    await registrarAuditoria(tx, {
      userId: null,
      criadorId: v.criadorId,
      acao: "atualizar",
      tabela: "produtos_certificados_versoes",
      registroId: v.id,
      detalhes: `PDF v${v.versao} do certificado ${v.dados.codigo} gerado (${pdf.byteLength} bytes)`,
      dadosNovos: { situacao: "PRONTA", arquivo_id: arquivoId },
    });
  });
  return "pronta";
}

/** Última tentativa falhou: FALHOU com mensagem legível (detalhe no log do worker). */
export async function marcarFalhaDaVersao(versaoId: string, erro: string): Promise<void> {
  await db
    .update(versoes)
    .set({ situacao: "FALHOU", erro: `Não foi possível gerar o PDF (${erro.slice(0, 200)}). Gere uma nova versão.`, updated_at: new Date() })
    .where(and(eq(versoes.id, versaoId), eq(versoes.situacao, "PENDENTE")));
}

/** Versões ainda PENDENTES (o worker reenfileira ao subir: cobre a fila que estava fora do ar). */
export async function versoesPendentes(): Promise<string[]> {
  return (await db.select({ id: versoes.id }).from(versoes).where(and(eq(versoes.situacao, "PENDENTE"), vivos(versoes)))).map((v) => v.id);
}
