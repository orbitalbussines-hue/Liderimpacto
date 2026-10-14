"use server";

import { and, eq, inArray } from "drizzle-orm";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { configDoAssistente } from "@/lib/assistente/config";
import { apagarConversa } from "@/lib/assistente/conversas";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE, TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { db } from "@/lib/db";
import { criadores_assistentes as assistentes, criadores_assistentes_produtos as assistentesProdutos, produtos } from "@/lib/db/schema";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import { violouUnico } from "@/lib/membros/vinculos";
import { apagarConversaSchema, configAssistenteSchema } from "@/lib/validators/ia";

/**
 * Assistente do professor (ADR-0014, RN-193 a RN-197). Configuração: DONO e ADMIN, com trava e
 * trilha (o texto das instruções vai na trilha: é configuração, não dado de aluno). Conversa: só o
 * PRÓPRIO membro apaga a sua (nenhum id de pessoa no corpo).
 */

export async function acaoSalvarConfigAssistente(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const e = configAssistenteSchema.parse(entrada);
    const escolhidos = [...new Set(e.produtos)];
    if (!e.todosOsCursos && !escolhidos.length) throw new ErroDeNegocio("Escolha ao menos um curso, ou marque “Todos os cursos”.");
    const valores = { ligado: e.ligado, nome: e.nome, instrucoes: e.instrucoes, limite_diario: e.limiteDiario, todos_os_cursos: e.todosOsCursos };
    const r = await db
      .transaction(async (tx) => {
        const antes = await configDoAssistente(criador.id, tx);
        if (escolhidos.length) {
          const vivosDoCriador = await tx
            .select({ id: produtos.id })
            .from(produtos)
            .where(and(eq(produtos.criador_id, criador.id), inArray(produtos.id, escolhidos), vivos(produtos)));
          if (vivosDoCriador.length !== escolhidos.length) throw new ErroDeNegocio("Curso não encontrado nesta área. Recarregue a página.");
        }
        let id: string;
        let versao: Date;
        if (e.versao === null) {
          if (antes.id) throw new ErroDeNegocio(MSG_COLISAO);
          const [n] = await tx.insert(assistentes).values({ criador_id: criador.id, ...valores, modified_by: usuario.id }).returning({ id: assistentes.id, updated_at: assistentes.updated_at });
          [id, versao] = [n.id, n.updated_at];
        } else {
          if (!antes.id) throw new ErroDeNegocio(MSG_COLISAO);
          const [n] = await tx
            .update(assistentes)
            .set({ ...valores, updated_at: new Date(), modified_by: usuario.id })
            .where(and(travaDeColisao(assistentes, antes.id, e.versao), eq(assistentes.criador_id, criador.id)))
            .returning({ id: assistentes.id, updated_at: assistentes.updated_at });
          if (!n) throw new ErroDeNegocio(MSG_COLISAO);
          [id, versao] = [n.id, n.updated_at];
        }
        // Cursos: sai quem deixou de estar na lista (lógico), entra quem é novo.
        const lista = e.todosOsCursos ? [] : escolhidos;
        const sair = antes.produtos.filter((p) => !lista.includes(p));
        if (sair.length) {
          await tx
            .update(assistentesProdutos)
            .set(marcaDeExclusao(usuario.id))
            .where(and(eq(assistentesProdutos.criador_id, criador.id), inArray(assistentesProdutos.produto_id, sair), vivos(assistentesProdutos)));
        }
        const entrar = lista.filter((p) => !antes.produtos.includes(p));
        if (entrar.length) await tx.insert(assistentesProdutos).values(entrar.map((p) => ({ criador_id: criador.id, produto_id: p, modified_by: usuario.id })));
        await registrarAuditoria(tx, {
          userId: usuario.id,
          criadorId: criador.id,
          acao: antes.id ? "atualizar" : "criar",
          tabela: "criadores_assistentes",
          registroId: id,
          detalhes: antes.ligado !== e.ligado ? `Assistente do professor ${e.ligado ? "ligado" : "desligado"}` : "Configuração do assistente do professor alterada",
          dadosAnteriores: antes.id
            ? { ligado: antes.ligado, nome: antes.nome, instrucoes: antes.instrucoes, limiteDiario: antes.limiteDiario, todosOsCursos: antes.todosOsCursos, produtos: antes.produtos }
            : undefined,
          dadosNovos: { ligado: e.ligado, nome: e.nome, instrucoes: e.instrucoes, limiteDiario: e.limiteDiario, todosOsCursos: e.todosOsCursos, produtos: lista },
        });
        return { versao };
      })
      .catch((erro: unknown) => {
        if (violouUnico(erro)) throw new ErroDeNegocio(MSG_COLISAO);
        throw erro;
      });
    return { versao: r.versao.toISOString() };
  });
}

export async function acaoApagarConversa(entrada: unknown) {
  return executar(async () => {
    const { usuario, criador, membro } = await exigirMembro(TODOS_OS_MEMBROS);
    if (!membro.id) throw new ErroDeNegocio("Conversa não encontrada.");
    const e = apagarConversaSchema.parse(entrada);
    await apagarConversa({ criadorId: criador.id, membroId: membro.id, usuarioId: usuario.id, conversaId: e.conversaId, versao: e.versao });
    return null;
  });
}
