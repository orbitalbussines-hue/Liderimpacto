"use server";

import { executar } from "@/lib/acao";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
import { pedirReindexacao } from "@/lib/conhecimento/pedir";
import { gravarLegenda, lerArquivoBruto, removerLegenda } from "@/lib/legendas/servico";
import { enviarLegendaSchema, removerLegendaSchema } from "@/lib/validators/legendas";

/**
 * Legendas da aula (RN-180, ADR-0013). DONO e ADMIN, criador do HOST. O arquivo bruto sobe direto
 * ao storage (`useEnvioDeArquivo("LEGENDA")`); aqui o servidor o lê, valida, converte, sanitiza e
 * grava o `.vtt` normalizado + o texto puro. Aula, arquivo ou legenda de outro criador = não encontrado.
 */

export async function acaoEnviarLegenda(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = enviarLegendaSchema.parse(entrada);
    const bruto = await lerArquivoBruto(criador.id, e.arquivoId);
    const r = await gravarLegenda({
      criadorId: criador.id,
      usuarioId: usuario.id,
      aulaId: e.aulaId,
      idioma: e.idioma,
      rotulo: e.rotulo,
      nome: bruto.nome,
      bytes: bruto.bytes,
      substituir: e.substituir,
      arquivoBrutoId: e.arquivoId,
    });
    // Base de conhecimento (ADR-0014): a transcrição da aula muda junto, depois do commit.
    await pedirReindexacao(criador.id, { tipo: "AULA", aulaId: e.aulaId }, usuario.id);
    return r;
  });
}

export async function acaoRemoverLegenda(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = removerLegendaSchema.parse(entrada);
    const { aulaId } = await removerLegenda({ criadorId: criador.id, usuarioId: usuario.id, legendaId: e.legendaId, versao: e.versao });
    await pedirReindexacao(criador.id, { tipo: "AULA", aulaId }, usuario.id);
    return null;
  });
}
