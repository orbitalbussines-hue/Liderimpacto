import "server-only";
import { and, eq, or } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import type { Transacao } from "@/lib/db";
import type { FinalidadeArquivo } from "@/lib/db/schema/_enums";
import { arquivos, criadores_trilhas, produtos, produtos_modulos_aulas, produtos_modulos_aulas_materiais } from "@/lib/db/schema";
import { marcaDeExclusao, vivos } from "@/lib/db/soft-delete";
import { apagarObjeto } from "./cliente";

/**
 * Registro dos arquivos no banco, usado pelas actions do catalogo DENTRO da transacao delas.
 * `criadorId` SEMPRE do host. Um arquivo e usado em UM lugar so (capa, thumb ou material):
 * trocar/remover apaga o objeto, e um segundo uso ficaria com a imagem quebrada. Capa de trilha
 * (passo 7) conta como uso.
 */

export const MSG_ARQUIVO_INVALIDO = "Arquivo inválido ou ainda não confirmado. Envie de novo.";

/** O arquivo esta referenciado por algum registro vivo do catalogo? */
async function emUso(tx: Transacao, arquivoId: string): Promise<boolean> {
  const [p] = await tx
    .select({ id: produtos.id })
    .from(produtos)
    .where(and(or(eq(produtos.capa_3x4_arquivo_id, arquivoId), eq(produtos.capa_16x9_arquivo_id, arquivoId)), vivos(produtos)))
    .limit(1);
  if (p) return true;
  const [a] = await tx
    .select({ id: produtos_modulos_aulas.id })
    .from(produtos_modulos_aulas)
    .where(and(eq(produtos_modulos_aulas.thumb_arquivo_id, arquivoId), vivos(produtos_modulos_aulas)))
    .limit(1);
  if (a) return true;
  const [m] = await tx
    .select({ id: produtos_modulos_aulas_materiais.id })
    .from(produtos_modulos_aulas_materiais)
    .where(and(eq(produtos_modulos_aulas_materiais.arquivo_id, arquivoId), vivos(produtos_modulos_aulas_materiais)))
    .limit(1);
  if (m) return true;
  // Passo 7: capa de trilha.
  const [t] = await tx.select({ id: criadores_trilhas.id }).from(criadores_trilhas).where(and(eq(criadores_trilhas.capa_arquivo_id, arquivoId), vivos(criadores_trilhas))).limit(1);
  return !!t;
}

/**
 * Arquivo pronto para ser USADO pelo criador do host: deste criador, vivo, DISPONIVEL (HEAD
 * conferido), da finalidade certa e ainda sem uso. Trava a linha ate o fim da transacao.
 * Arquivo de outro criador cai aqui (o filtro de criador nao o encontra) com a mesma mensagem.
 */
export async function arquivoParaUsar(tx: Transacao, criadorId: string, arquivoId: string, finalidade: FinalidadeArquivo) {
  const [a] = await tx
    .select()
    .from(arquivos)
    .where(
      and(
        eq(arquivos.id, arquivoId),
        eq(arquivos.criador_id, criadorId),
        eq(arquivos.finalidade, finalidade),
        eq(arquivos.status, "DISPONIVEL"),
        vivos(arquivos),
      ),
    )
    .for("update");
  if (!a || (await emUso(tx, arquivoId))) throw new ErroDeNegocio(MSG_ARQUIVO_INVALIDO);
  return a;
}

/**
 * Descarta o arquivo que deixou de ser usado (trocado ou removido): soft delete do registro, na
 * transacao de quem chama, com trilha. Devolve a chave: o OBJETO e apagado depois do commit
 * (`apagarObjetosDescartados`), para um rollback nunca deixar registro vivo sem objeto.
 */
export async function descartarArquivo(tx: Transacao, p: { criadorId: string; arquivoId: string; autorId: string; motivo: string }): Promise<string | null> {
  const [a] = await tx
    .update(arquivos)
    .set(marcaDeExclusao(p.autorId))
    .where(and(eq(arquivos.id, p.arquivoId), eq(arquivos.criador_id, p.criadorId), vivos(arquivos)))
    .returning({ chave: arquivos.chave, nome: arquivos.nome_original });
  if (!a) return null;
  await registrarAuditoria(tx, {
    userId: p.autorId,
    criadorId: p.criadorId,
    acao: "excluir",
    tabela: "arquivos",
    registroId: p.arquivoId,
    detalhes: `Descartou o arquivo "${a.nome}" (${p.motivo})`,
    dadosAnteriores: { chave: a.chave },
  });
  return a.chave;
}

/**
 * Depois do commit: apaga do storage os objetos descartados. Best-effort (o registro ja esta
 * excluido); falha vira log CRITICAL com a chave para limpeza manual.
 * ponytail: sem fila de limpeza; orfaos (falha aqui ou envio nunca confirmado) ficam no bucket
 * ate um job de varredura (comparar chaves do bucket com `arquivos` vivos) quando o volume pedir.
 */
export async function apagarObjetosDescartados(criadorId: string, chaves: readonly (string | null)[]): Promise<void> {
  await Promise.all(
    chaves
      .filter((c): c is string => !!c)
      .map((chave) =>
        apagarObjeto({ bucket: "arquivos", criadorId, chave }).catch((e: unknown) => console.error("CRITICAL [armazenamento] objeto nao apagado:", chave, e)),
      ),
  );
}

