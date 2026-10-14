import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { usuarios_contas, usuarios_senhas_anteriores } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { conferirSenha } from "./senha-kdf";

/**
 * Historico curto de senhas (auditoria REQ-B7). Guardamos as ultimas
 * `QUANTIDADE_GUARDADA` senhas (so o hash) e recusamos repetir qualquer uma
 * delas, nem a atual. Leitura FAIL-CLOSED: se o banco falhar, a troca e
 * recusada — aceitar seria trocar a garantia por conveniencia.
 *
 * Custo: conferir o historico roda o KDF uma vez por hash guardado (~0,5 s cada
 * na VPS). E uma operacao rara (trocar ou definir senha), com espera na tela.
 */
export const QUANTIDADE_GUARDADA = 5;
export const MSG_SENHA_REPETIDA = "Você já usou essa senha. Escolha uma que nunca usou aqui.";

/** Hash da senha em uso hoje (ou `null` se a conta esta sem senha). */
export async function hashAtualDaConta(usuarioId: string): Promise<string | null> {
  const [conta] = await db
    .select({ hash: usuarios_contas.senha_hash })
    .from(usuarios_contas)
    .where(and(eq(usuarios_contas.usuario_id, usuarioId), eq(usuarios_contas.provedor_id, "credential"), vivos(usuarios_contas)));
  return conta?.hash ?? null;
}

/** A senha nova e igual a atual ou a alguma das ultimas guardadas? */
export async function senhaRepetida(usuarioId: string, senha: string): Promise<boolean> {
  const anteriores = await db
    .select({ hash: usuarios_senhas_anteriores.senha_hash })
    .from(usuarios_senhas_anteriores)
    .where(and(eq(usuarios_senhas_anteriores.usuario_id, usuarioId), vivos(usuarios_senhas_anteriores)))
    .orderBy(desc(usuarios_senhas_anteriores.created_at))
    .limit(QUANTIDADE_GUARDADA);
  const atual = await hashAtualDaConta(usuarioId);
  // Sequencial de proposito: em paralelo seriam varios scrypt de 128 MiB juntos.
  for (const hash of [atual, ...anteriores.map((a) => a.hash)]) {
    if (hash && (await conferirSenha(hash, senha))) return true;
  }
  return false;
}

/** Guarda o hash que acabou de sair de uso. Chamado DEPOIS da troca dar certo. */
export async function guardarSenhaAnterior(usuarioId: string, hashAntigo: string | null): Promise<void> {
  if (!hashAntigo) return;
  await db.insert(usuarios_senhas_anteriores).values({ usuario_id: usuarioId, senha_hash: hashAntigo, modified_by: usuarioId });
}
