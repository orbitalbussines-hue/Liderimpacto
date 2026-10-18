import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db } from "@/lib/db";
import { criadores_emails_descadastros as d, criadores_membros, usuarios } from "@/lib/db/schema";
import { AUTOR_SISTEMA } from "@/lib/conhecimento/regras";
import type { OrigemDescadastro } from "@/lib/db/schema/_enums";
import { vivos } from "@/lib/db/soft-delete";
import { hashDoDestinatario, mascararEmail } from "@/lib/email/disparos";

/**
 * DESCADASTRO (RN-227, LGPD): pelo link do rodapé (página de confirmação) ou pelo botão do cliente de
 * e-mail (RFC 8058, POST de um clique), sem login. Vale para campanhas e automações DESTA área; e-mail
 * transacional (senha, primeiro acesso, avisos) continua chegando. Guarda o HMAC do endereço (não o
 * e-mail): o token só traz o HMAC, então a máscara da tela sai da conta do membro, quando ela existe.
 */

/** Pessoa da área com este HMAC (máscara e autoria da trilha). ponytail: varre os membros da área; índice por HMAC se passar de ~50 mil. */
async function pessoaDoHash(criadorId: string, hash: string): Promise<{ usuarioId: string; email: string } | null> {
  const linhas = await db
    .select({ usuarioId: usuarios.id, email: usuarios.email })
    .from(criadores_membros)
    .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .where(eq(criadores_membros.criador_id, criadorId));
  return linhas.find((l) => hashDoDestinatario(l.email) === hash) ?? null;
}

/** Idempotente: descadastrar duas vezes não cria outra linha. Devolve se foi novo. */
export async function descadastrar(criadorId: string, hash: string, origem: OrigemDescadastro): Promise<boolean> {
  const pessoa = await pessoaDoHash(criadorId, hash);
  const mascarado = pessoa ? mascararEmail(pessoa.email) : "(endereço não identificado)";
  return db.transaction(async (tx) => {
    const [novo] = await tx
      .insert(d)
      .values({ criador_id: criadorId, destinatario_hash: hash, destinatario_mascarado: mascarado, origem, modified_by: pessoa?.usuarioId ?? AUTOR_SISTEMA })
      .onConflictDoNothing()
      .returning({ id: d.id });
    if (!novo) return false;
    await registrarAuditoria(tx, {
      userId: pessoa?.usuarioId ?? null,
      criadorId,
      acao: "criar",
      tabela: "criadores_emails_descadastros",
      registroId: novo.id,
      detalhes: `Descadastro dos e-mails de marketing (${mascarado}) ${origem === "UM_CLIQUE" ? "pelo botão do cliente de e-mail" : "pelo link do e-mail"}`,
    });
    return true;
  });
}

export async function estaDescadastrado(criadorId: string, email: string): Promise<boolean> {
  const [x] = await db.select({ id: d.id }).from(d).where(and(eq(d.criador_id, criadorId), eq(d.destinatario_hash, hashDoDestinatario(email)), vivos(d)));
  return !!x;
}

/** Lista para a tela (DONO e ADMIN): máscara, origem e quando; `email` = busca EXATA pelo HMAC. */
export async function listarDescadastros(criadorId: string, f: { email?: string; pagina: number; porPagina: number }) {
  const onde = and(eq(d.criador_id, criadorId), vivos(d), f.email?.trim() ? eq(d.destinatario_hash, hashDoDestinatario(f.email)) : undefined);
  const linhas = await db
    .select({ id: d.id, destinatario: d.destinatario_mascarado, origem: d.origem, quando: d.created_at, total: sql<number>`count(*) over ()::int` })
    .from(d)
    .where(onde)
    .orderBy(desc(d.created_at), desc(d.id))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina);
  return { total: linhas[0]?.total ?? 0, linhas: linhas.map((l) => ({ id: l.id, destinatario: l.destinatario, origem: l.origem, quando: l.quando })) };
}
