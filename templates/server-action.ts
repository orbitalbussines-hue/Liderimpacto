/**
 * TEMPLATE-OURO: Server Actions de uma entidade (CRUD centralizado).
 * Copie para src/lib/actions/<entidade>.ts. TODA a regra da entidade mora aqui;
 * telas so chamam estas funcoes.
 *
 * Cada action: exigirMembro (sessao + criador do host + papel) -> Zod -> transacao (mutacao + auditoria)
 * -> revalidatePath. Server Action e um POST alcancavel direto: valide tudo.
 */
"use server";

import { desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirMembro } from "@/lib/auth/autorizacao";
import { EQUIPE, TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { db } from "@/lib/db";
import { contratosLancamentos as tabela } from "@/lib/db/schema/contratos-lancamentos";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import {
  idSchema,
  instanteSchema,
  lancamentoEdicaoSchema,
  lancamentoSchema,
} from "@/lib/validators/contratos-lancamentos";

const NOME_TABELA = "contratos_lancamentos";
const ROTA = "/lancamentos";

/** Leitura para Server Component: lanca em falha (cai no error.tsx). */
export async function listar() {
  // O criador vem do HOST (nunca do corpo): toda consulta/escrita filtra e grava criador.id.
  const { usuario, criador } = await exigirMembro(TODOS_OS_MEMBROS);
  return db.select().from(tabela).where(vivos(tabela)).orderBy(desc(tabela.created_at));
}

export async function criar(dados: unknown) {
  return executar(async () => {
    // O criador vem do HOST (nunca do corpo): toda consulta/escrita filtra e grava criador.id.
    const { usuario, criador } = await exigirMembro(EQUIPE);
    // Campo a campo: nunca espalhe o corpo da requisicao sobre a linha.
    const { contrato_id, descricao, valor } = lancamentoSchema.parse(dados);

    const criado = await db.transaction(async (tx) => {
      const [linha] = await tx
        .insert(tabela)
        .values({ contrato_id, descricao, valor, modified_by: usuario.id })
        .returning();
      await registrarAuditoria(tx, {
        userId: usuario.id,
        acao: "criar",
        tabela: NOME_TABELA,
        registroId: linha.id,
        detalhes: `Criou lancamento "${linha.descricao}"`,
        dadosNovos: linha,
      });
      return linha;
    });
    revalidatePath(ROTA);
    return criado;
  });
}

/** `updatedAtOriginal` = o `updated_at` que a tela recebeu ao abrir o registro. */
export async function atualizar(id: unknown, dados: unknown, updatedAtOriginal: unknown) {
  return executar(async () => {
    // O criador vem do HOST (nunca do corpo): toda consulta/escrita filtra e grava criador.id.
    const { usuario, criador } = await exigirMembro(EQUIPE);
    const alvo = idSchema.parse(id);
    const versao = instanteSchema.parse(updatedAtOriginal);
    const { descricao, valor } = lancamentoEdicaoSchema.parse(dados);

    const atualizado = await db.transaction(async (tx) => {
      const [anterior] = await tx.select().from(tabela).where(travaDeColisao(tabela, alvo, versao));
      if (!anterior) throw new ErroDeNegocio(MSG_COLISAO);

      const [linha] = await tx
        .update(tabela)
        .set({ descricao, valor, updated_at: new Date(), modified_by: usuario.id })
        .where(travaDeColisao(tabela, alvo, versao))
        .returning();
      if (!linha) throw new ErroDeNegocio(MSG_COLISAO);

      await registrarAuditoria(tx, {
        userId: usuario.id,
        acao: "atualizar",
        tabela: NOME_TABELA,
        registroId: alvo,
        detalhes: `Alterou lancamento "${anterior.descricao}"`,
        dadosAnteriores: anterior,
        dadosNovos: linha,
      });
      return linha;
    });
    revalidatePath(ROTA);
    return atualizado;
  });
}

/** Soft delete, com a mesma trava de colisao da edicao. */
export async function excluir(id: unknown, updatedAtOriginal: unknown) {
  return executar(async () => {
    // O criador vem do HOST (nunca do corpo): toda consulta/escrita filtra e grava criador.id.
    const { usuario, criador } = await exigirMembro(["DONO"]);
    const alvo = idSchema.parse(id);
    const versao = instanteSchema.parse(updatedAtOriginal);

    await db.transaction(async (tx) => {
      const [linha] = await tx
        .update(tabela)
        .set(marcaDeExclusao(usuario.id))
        .where(travaDeColisao(tabela, alvo, versao))
        .returning();
      if (!linha) throw new ErroDeNegocio(MSG_COLISAO);

      await registrarAuditoria(tx, {
        userId: usuario.id,
        acao: "excluir",
        tabela: NOME_TABELA,
        registroId: alvo,
        detalhes: `Excluiu (logico) lancamento "${linha.descricao}"`,
        dadosAnteriores: linha,
      });
    });
    revalidatePath(ROTA);
    return { id: alvo };
  });
}
