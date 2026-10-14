"use server";

import { executar } from "@/lib/acao";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE } from "@/lib/auth/permissoes";
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
    return gravarLegenda({
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
  });
}

export async function acaoRemoverLegenda(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = removerLegendaSchema.parse(entrada);
    await removerLegenda({ criadorId: criador.id, usuarioId: usuario.id, legendaId: e.legendaId, versao: e.versao });
    return null;
  });
}
