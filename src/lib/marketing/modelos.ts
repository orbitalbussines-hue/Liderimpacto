import "server-only";
import { and, eq } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import type { Transacao } from "@/lib/db";
import { criadores_emails_modelos as mod } from "@/lib/db/schema";
import type { ConteudoMarketing } from "@/lib/db/schema/marketing";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao } from "@/lib/db/soft-delete";
import { violouUnico } from "@/lib/membros/vinculos";

/**
 * MODELOS de e-mail (RN-220): conteúdo pronto para reaproveitar. A tela COPIA o conteúdo do modelo
 * para a campanha/automação (editar o modelo depois não muda o que já foi criado com ele).
 */

const TABELA = "criadores_emails_modelos";
export const MSG_MODELO_DUPLICADO = "Já existe um modelo com este nome.";
const duplicado = (e: unknown): never => {
  if (violouUnico(e)) throw new ErroDeNegocio(MSG_MODELO_DUPLICADO);
  throw e;
};

export async function criarModelo(tx: Transacao, p: { criadorId: string; autor: string; nome: string; conteudo: ConteudoMarketing }): Promise<{ id: string; versao: Date }> {
  const [m] = await tx
    .insert(mod)
    .values({ criador_id: p.criadorId, nome: p.nome, conteudo: p.conteudo, modified_by: p.autor })
    .returning({ id: mod.id, versao: mod.updated_at })
    .catch(duplicado);
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "criar", tabela: TABELA, registroId: m.id, detalhes: `Criou o modelo de e-mail "${p.nome}"` });
  return m;
}

export async function salvarModelo(tx: Transacao, p: { criadorId: string; autor: string; modeloId: string; versao: Date; nome: string; conteudo: ConteudoMarketing }): Promise<{ versao: Date }> {
  const [m] = await tx
    .update(mod)
    .set({ nome: p.nome, conteudo: p.conteudo, updated_at: new Date(), modified_by: p.autor })
    .where(and(travaDeColisao(mod, p.modeloId, p.versao), eq(mod.criador_id, p.criadorId)))
    .returning({ versao: mod.updated_at })
    .catch(duplicado);
  if (!m) throw new ErroDeNegocio(MSG_COLISAO);
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "atualizar", tabela: TABELA, registroId: p.modeloId, detalhes: `Editou o modelo de e-mail "${p.nome}"` });
  return m;
}

export async function excluirModelo(tx: Transacao, p: { criadorId: string; autor: string; modeloId: string; versao: Date }): Promise<void> {
  const [m] = await tx
    .update(mod)
    .set(marcaDeExclusao(p.autor))
    .where(and(travaDeColisao(mod, p.modeloId, p.versao), eq(mod.criador_id, p.criadorId)))
    .returning({ nome: mod.nome });
  if (!m) throw new ErroDeNegocio(MSG_COLISAO);
  await registrarAuditoria(tx, { userId: p.autor, criadorId: p.criadorId, acao: "excluir", tabela: TABELA, registroId: p.modeloId, detalhes: `Excluiu o modelo de e-mail "${m.nome}"` });
}
