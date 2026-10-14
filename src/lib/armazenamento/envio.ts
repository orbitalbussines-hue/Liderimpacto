import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db } from "@/lib/db";
import type { FinalidadeArquivo } from "@/lib/db/schema/_enums";
import { arquivos } from "@/lib/db/schema";
import { marcaDeExclusao, vivos } from "@/lib/db/soft-delete";
import { apagarObjetosDescartados } from "./arquivos";
import { cabecalhoDoObjeto, urlDeEnvio, type UrlDeEnvio } from "./cliente";
import { chaveDeArquivo, chavePertenceAoCriador, formatarTamanho, validarEnvio } from "./regras";

/**
 * Envio direto ao storage em 3 tempos (o Next nunca recebe o binário), comum ao catálogo
 * (`src/lib/actions/arquivos.ts`, equipe) e aos anexos da comunidade (qualquer membro):
 *   1. `iniciarEnvio`  -> allowlist + registro ENVIADO_PENDENTE + URL de PUT assinada (10 min)
 *   2. o navegador faz o PUT direto no storage (Content-Type e tamanho presos na assinatura)
 *   3. `confirmarEnvio` -> HEAD confere tamanho e tipo -> DISPONIVEL (só então pode ser usado)
 * Quem chama já conferiu sessão e permissão; `criadorId` SEMPRE do host.
 */

export async function iniciarEnvio(p: {
  criadorId: string;
  usuarioId: string;
  finalidade: FinalidadeArquivo;
  nome: string;
  mime: string;
  tamanho: number;
}): Promise<{ arquivoId: string; envio: UrlDeEnvio }> {
  const { extensao, mime } = validarEnvio(p.finalidade, p);
  const id = randomUUID();
  const chave = chaveDeArquivo(p.criadorId, p.finalidade, id, extensao);
  await db.transaction(async (tx) => {
    await tx.insert(arquivos).values({
      id,
      criador_id: p.criadorId,
      chave,
      finalidade: p.finalidade,
      nome_original: p.nome,
      mime,
      tamanho_bytes: p.tamanho,
      status: "ENVIADO_PENDENTE",
      modified_by: p.usuarioId,
    });
    await registrarAuditoria(tx, {
      userId: p.usuarioId,
      criadorId: p.criadorId,
      acao: "criar",
      tabela: "arquivos",
      registroId: id,
      detalhes: `Iniciou o envio de "${p.nome}" (${formatarTamanho(p.tamanho)})`,
      dadosNovos: { finalidade: p.finalidade, mime, tamanho_bytes: p.tamanho, chave },
    });
  });
  return { arquivoId: id, envio: await urlDeEnvio({ bucket: "arquivos", criadorId: p.criadorId, chave, mime, tamanho: p.tamanho }) };
}

/**
 * Confere o objeto no storage e libera o arquivo. Diferença de tamanho ou tipo (ou objeto que não
 * chegou): o registro sai (soft delete) e o objeto é apagado — reenvie. `finalidades` limita o que
 * esta porta confirma; `somenteDoAutor` = só quem iniciou o envio confirma (comunidade).
 */
export async function confirmarEnvio(p: {
  criadorId: string;
  usuarioId: string;
  arquivoId: string;
  finalidades: readonly FinalidadeArquivo[];
  somenteDoAutor?: boolean;
}): Promise<{ arquivoId: string; nome: string; mime: string; tamanho: number; finalidade: FinalidadeArquivo }> {
  const doCriador = and(
    eq(arquivos.id, p.arquivoId),
    eq(arquivos.criador_id, p.criadorId),
    inArray(arquivos.finalidade, [...p.finalidades]),
    p.somenteDoAutor ? eq(arquivos.modified_by, p.usuarioId) : undefined,
    vivos(arquivos),
  );
  const [a] = await db.select().from(arquivos).where(and(doCriador, eq(arquivos.status, "ENVIADO_PENDENTE")));
  // Arquivo de outro criador nao e encontrado aqui (filtro do host) — e a chave confere de novo.
  if (!a || !chavePertenceAoCriador(a.chave, p.criadorId)) throw new ErroDeNegocio("Envio não encontrado. Envie o arquivo de novo.");

  const real = await cabecalhoDoObjeto({ bucket: "arquivos", criadorId: p.criadorId, chave: a.chave });
  const confere = real !== null && real.tamanho === a.tamanho_bytes && real.mime === a.mime;

  await db.transaction(async (tx) => {
    const [linha] = await tx
      .update(arquivos)
      .set(confere ? { status: "DISPONIVEL", updated_at: new Date(), modified_by: p.usuarioId } : marcaDeExclusao(p.usuarioId))
      .where(and(doCriador, eq(arquivos.status, "ENVIADO_PENDENTE")))
      .returning({ id: arquivos.id });
    if (!linha) throw new ErroDeNegocio("Envio já confirmado ou descartado.");
    await registrarAuditoria(tx, {
      userId: p.usuarioId,
      criadorId: p.criadorId,
      acao: confere ? "atualizar" : "excluir",
      tabela: "arquivos",
      registroId: a.id,
      detalhes: confere
        ? `Confirmou o envio de "${a.nome_original}"`
        : `Recusou o envio de "${a.nome_original}": ${real ? "tamanho ou tipo diferente do declarado" : "arquivo não chegou ao armazenamento"}`,
      dadosAnteriores: { status: a.status },
      dadosNovos: confere ? { status: "DISPONIVEL" } : { real },
    });
  });
  if (!confere) {
    if (real) await apagarObjetosDescartados(p.criadorId, [a.chave]);
    throw new ErroDeNegocio("O arquivo não chegou inteiro ao armazenamento. Envie de novo.");
  }
  return { arquivoId: a.id, nome: a.nome_original, mime: a.mime, tamanho: a.tamanho_bytes, finalidade: a.finalidade as FinalidadeArquivo };
}
