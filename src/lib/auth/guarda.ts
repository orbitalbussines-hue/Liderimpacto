import "server-only";
import { forbidden, redirect } from "next/navigation";
import type { PapelCriador } from "@/lib/db/schema/_enums";
import { avaliarMembro, avaliarSuperAdmin, type MembroDaRequisicao } from "./autorizacao";
import { obterSessaoDeSeguranca, type SessaoAtiva } from "./sessao";

/**
 * Guardas de PAGINA (Server Components, sempre dentro de <Suspense> por causa do
 * cacheComponents). As actions tem as suas (autorizacao.ts): cada fronteira confere sozinha.
 */

/** Sem sessao -> /login. Sessao provisoria (SUPER_ADMIN sem TOTP) -> cadastrar o fator. */
export async function sessaoDaPagina(): Promise<SessaoAtiva> {
  const s = await obterSessaoDeSeguranca();
  if (!s) redirect("/login");
  if (s.provisoria) redirect("/conta/seguranca");
  return s as SessaoAtiva;
}

/** Pagina da area do criador. Papel fora da lista (ou apex): 403, registrado na trilha. */
export async function membroDaPagina(papeis: readonly PapelCriador[]): Promise<MembroDaRequisicao> {
  const r = await avaliarMembro(await sessaoDaPagina(), papeis);
  if (!r) forbidden();
  return r;
}

export async function superAdminDaPagina(): Promise<SessaoAtiva> {
  const s = await sessaoDaPagina();
  if (!(await avaliarSuperAdmin(s))) forbidden();
  return s;
}
