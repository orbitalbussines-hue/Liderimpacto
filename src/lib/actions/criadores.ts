"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirSuperAdmin, MSG_SEM_PERMISSAO } from "@/lib/auth/autorizacao";
import { db } from "@/lib/db";
import { criadores } from "@/lib/db/schema";
import { STATUS_CRIADOR } from "@/lib/db/schema/_enums";
import { MSG_COLISAO, travaDeColisao } from "@/lib/db/soft-delete";
import { validarHex } from "@/lib/marca/paleta";
import { linkDePrimeiroAcesso, MSG_CONTA_EXISTENTE } from "@/lib/membros/primeiro-acesso";
import { vincularPessoa, violouUnico } from "@/lib/membros/vinculos";
import { novoCriadorSchema } from "@/lib/validators/criadores";
import { idSchema, versaoSchema } from "@/lib/validators/membros";

/**
 * Area da PLATAFORMA (apex, so SUPER_ADMIN): criar criador com o DONO e suspender/reativar.
 * Suspenso = o host da area responde 404 e as sessoes de la caem na proxima requisicao.
 */

async function exigirPlataforma() {
  const s = await exigirSuperAdmin();
  if (s.alvo.tipo !== "plataforma") throw new ErroDeNegocio(MSG_SEM_PERMISSAO);
  return s;
}

export async function acaoCriarCriador(entrada: unknown) {
  return executar(async () => {
    const s = await exigirPlataforma();
    const e = novoCriadorSchema.parse(entrada);
    const cor = e.cor ? validarHex(e.cor) : null;
    const criadorId = randomUUID();
    const vinculo = await db
      .transaction(async (tx) => {
        await tx.insert(criadores).values({ id: criadorId, slug: e.slug, nome: e.nome, cor_marca: cor, modified_by: s.userId });
        await registrarAuditoria(tx, {
          userId: s.userId,
          criadorId,
          acao: "criar",
          tabela: "criadores",
          registroId: criadorId,
          detalhes: `Criou o criador "${e.nome}" (${e.slug})`,
          dadosNovos: { nome: e.nome, slug: e.slug, cor_marca: cor },
        });
        const v = await vincularPessoa(tx, { criadorId, autorId: s.userId, nome: e.donoNome, email: e.donoEmail, papel: "DONO" });
        if (v.tipo === "ja-membro") throw new Error("criador recem-criado nao pode ter membro");
        return v;
      })
      .catch((erro: unknown) => {
        if (violouUnico(erro)) throw new ErroDeNegocio("Este endereço já está em uso. Escolha outro.");
        throw erro;
      });
    const link = vinculo.identidadeNova
      ? await linkDePrimeiroAcesso(vinculo.usuarioId, { id: criadorId, slug: e.slug }, s.userId, "Primeiro acesso do DONO (novo criador)")
      : null;
    return { id: criadorId, slug: e.slug, link, aviso: link ? null : MSG_CONTA_EXISTENTE };
  });
}

export async function acaoAlterarSituacaoCriador(entrada: unknown) {
  return executar(async () => {
    const s = await exigirPlataforma();
    const e = z.strictObject({ criadorId: idSchema, status: z.enum(STATUS_CRIADOR, "Situação inválida."), versao: versaoSchema }).parse(entrada);
    await db.transaction(async (tx) => {
      const [antes] = await tx.select({ status: criadores.status, slug: criadores.slug }).from(criadores).where(travaDeColisao(criadores, e.criadorId, e.versao));
      if (!antes) throw new ErroDeNegocio(MSG_COLISAO);
      if (antes.status === e.status) return;
      const [linha] = await tx
        .update(criadores)
        .set({ status: e.status, updated_at: new Date(), modified_by: s.userId })
        .where(travaDeColisao(criadores, e.criadorId, e.versao))
        .returning({ id: criadores.id });
      if (!linha) throw new ErroDeNegocio(MSG_COLISAO);
      await registrarAuditoria(tx, {
        userId: s.userId,
        criadorId: e.criadorId,
        acao: "atualizar",
        tabela: "criadores",
        registroId: e.criadorId,
        detalhes: `Situação do criador ${antes.slug}: ${antes.status} → ${e.status}`,
        dadosAnteriores: { status: antes.status },
        dadosNovos: { status: e.status },
      });
    });
    return null;
  });
}
