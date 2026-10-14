import "server-only";
import { and, desc, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria, registrarAuditoriaSegura } from "@/lib/audit/registrar";
import { criadorIdDo } from "@/lib/criador/area";
import { db } from "@/lib/db";
import { usuarios_contas, usuarios_sessoes } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { auth } from "./auth";
import { avisarDono } from "./aviso";
import { TETO_SESSAO_S } from "./funil-sessao";
import { guardarSenhaAnterior, hashAtualDaConta } from "./historico-senha";
import { recusaDaPolitica } from "./politica-senha";
import { conferirSenha } from "./senha-kdf";
import { expirarSessoesDe, INATIVIDADE_MS, type SessaoDeSeguranca } from "./sessao";
import { estourouTeto } from "./teto";

/**
 * Conta > Seguranca: senha e sessoes. O alvo de TODA funcao e a sessao corrente — nenhuma
 * recebe `userId` do corpo (docs/seguranca-login.md, "Tela Meu perfil > Seguranca").
 */

/** Confere a senha atual (mesmo KDF do login). Nao alimenta o bloqueio de login. */
export async function senhaConfere(usuarioId: string, senha: string): Promise<boolean> {
  const [conta] = await db
    .select({ hash: usuarios_contas.senha_hash })
    .from(usuarios_contas)
    .where(and(eq(usuarios_contas.usuario_id, usuarioId), eq(usuarios_contas.provedor_id, "credential"), vivos(usuarios_contas)));
  if (!conta?.hash) return false;
  return conferirSenha(conta.hash, senha);
}

/**
 * Troca de senha: a senha ATUAL e a reautenticacao (prova de que quem esta na sessao e o
 * dono). Aplica a politica inteira e encerra as OUTRAS sessoes (em todas as areas).
 */
export async function trocarSenha(sessao: SessaoDeSeguranca, atual: string, nova: string): Promise<void> {
  if (sessao.provisoria) throw new ErroDeNegocio("Conclua a configuração do segundo fator primeiro.");
  if (await estourouTeto(`troca-senha:${sessao.userId}`, 600, 10)) throw new ErroDeNegocio("Muitas tentativas. Aguarde alguns minutos.");
  // Prova a senha ATUAL primeiro: a politica (historico e vazamento) so roda para quem ja
  // provou quem e — senao a mensagem de recusa vira oraculo da senha em uso.
  if (!(await senhaConfere(sessao.userId, atual))) throw new ErroDeNegocio("Senha atual incorreta.");
  const recusa = await recusaDaPolitica(nova, { email: sessao.email, nome: sessao.nome, usuarioId: sessao.userId });
  if (recusa) throw new ErroDeNegocio(recusa);
  const hashAntigo = await hashAtualDaConta(sessao.userId);
  try {
    await auth.api.changePassword({ body: { currentPassword: atual, newPassword: nova, revokeOtherSessions: false }, headers: await headers() });
  } catch {
    throw new ErroDeNegocio("Senha atual incorreta.");
  }
  await guardarSenhaAnterior(sessao.userId, hashAntigo);
  await db.transaction(async (tx) => {
    await registrarAuditoria(tx, {
      userId: sessao.userId,
      criadorId: criadorIdDo(sessao.alvo),
      acao: "senha",
      tabela: "usuarios",
      registroId: sessao.userId,
      detalhes: "Senha trocada pelo próprio usuário (outras sessões encerradas)",
    });
    await expirarSessoesDe(tx, sessao.userId, sessao.sessaoId);
  });
  await avisarDono(sessao.userId, "A senha da sua conta foi trocada");
}

export interface SessaoVisivel {
  id: string;
  criadaEm: Date;
  ip: string | null;
  agente: string | null;
  atual: boolean;
}

/** Sessoes abertas da conta (todas as areas). O token NUNCA sai do servidor. */
export async function listarSessoes(sessao: SessaoDeSeguranca): Promise<SessaoVisivel[]> {
  const agora = new Date();
  const linhas = await db
    .select({ id: usuarios_sessoes.id, expiraEm: usuarios_sessoes.expira_em, usoEm: usuarios_sessoes.updated_at, ip: usuarios_sessoes.ip, agente: usuarios_sessoes.agente })
    .from(usuarios_sessoes)
    .where(and(eq(usuarios_sessoes.usuario_id, sessao.userId), gt(usuarios_sessoes.expira_em, agora)))
    .orderBy(desc(usuarios_sessoes.expira_em));
  return linhas
    .filter((l) => agora.getTime() - l.usoEm.getTime() <= INATIVIDADE_MS) // ociosa ja nao entra
    .map((l) => ({ id: l.id, ip: l.ip, agente: l.agente, criadaEm: new Date(l.expiraEm.getTime() - TETO_SESSAO_S * 1000), atual: l.id === sessao.sessaoId }));
}

/** Encerra todas as outras sessoes desta conta (em todos os aparelhos e areas). */
export async function encerrarOutrasSessoes(sessao: SessaoDeSeguranca): Promise<void> {
  await registrarAuditoriaSegura({
    userId: sessao.userId,
    criadorId: criadorIdDo(sessao.alvo),
    acao: "logout",
    tabela: "usuarios",
    registroId: sessao.userId,
    detalhes: "Encerrou todas as outras sessões pela tela de segurança",
  });
  await expirarSessoesDe(db, sessao.userId, sessao.sessaoId);
}
