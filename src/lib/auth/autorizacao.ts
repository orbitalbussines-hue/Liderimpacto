import "server-only";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoriaSegura } from "@/lib/audit/registrar";
import { criadorIdDo, type CriadorDaRequisicao } from "@/lib/criador/area";
import type { PapelCriador } from "@/lib/db/schema/_enums";
import { papelAceito, papelEfetivo } from "./permissoes";
import { obterSessao, type SessaoAtiva, type SessaoDeSeguranca } from "./sessao";

/**
 * PORTOES das Server Actions (cada action confere por conta propria: a borda nao e
 * fronteira). Erro esperado vira `ErroDeNegocio` (o `executar()` transforma em mensagem).
 * Paginas usam as versoes de guarda.ts (redirect/403), que chamam o MESMO nucleo daqui.
 */

export const MSG_SESSAO_EXPIRADA = "Sessão expirada. Entre novamente.";
export const MSG_SEM_PERMISSAO = "Sem permissão para esta ação.";

export interface MembroDaRequisicao {
  usuario: { id: string; nome: string; email: string; papelPlataforma: SessaoAtiva["papelPlataforma"] };
  /** SEMPRE do host da requisicao — nunca do corpo. */
  criador: CriadorDaRequisicao;
  /** `id` nulo = SUPER_ADMIN sem vinculo (suporte); `papel` e o efetivo (SUPER_ADMIN = DONO). */
  membro: { id: string | null; papel: PapelCriador; superAdmin: boolean };
}

/** Recusa 403 na trilha (docs/seguranca-login.md, Trilha). Best-effort: nao segura a resposta. */
export async function registrarRecusa(s: SessaoDeSeguranca, exigido: string): Promise<void> {
  await registrarAuditoriaSegura({
    userId: s.userId,
    criadorId: criadorIdDo(s.alvo),
    acao: "acesso_negado",
    tabela: "usuarios",
    registroId: s.userId,
    detalhes: `Recusa 403: exige ${exigido}; papel efetivo ${papelEfetivo(s.acesso) ?? "nenhum"}`,
  });
}

/** Nucleo: sessao plena + area de criador + papel aceito. `null` = recusado (ja na trilha). */
export async function avaliarMembro(s: SessaoAtiva, papeis: readonly PapelCriador[]): Promise<MembroDaRequisicao | null> {
  if (s.alvo.tipo !== "criador" || !papelAceito(s.acesso, papeis)) {
    await registrarRecusa(s, `${papeis.join(" ou ")} no criador`);
    return null;
  }
  return {
    usuario: { id: s.userId, nome: s.nome, email: s.email, papelPlataforma: s.papelPlataforma },
    criador: s.alvo.criador,
    membro: { id: s.acesso.membro?.id ?? null, papel: papelEfetivo(s.acesso)!, superAdmin: s.acesso.superAdmin },
  };
}

/** Portao de toda Server Action: sem sessao PLENA (conta ativa, area certa, fator em dia), nada roda. */
export async function exigirSessao(): Promise<SessaoAtiva> {
  const s = await obterSessao();
  if (!s) throw new ErroDeNegocio(MSG_SESSAO_EXPIRADA);
  return s;
}

/** Action de negocio do criador: `{ usuario, criador, membro }`, criador SEMPRE do host. */
export async function exigirMembro(papeis: readonly PapelCriador[]): Promise<MembroDaRequisicao> {
  const r = await avaliarMembro(await exigirSessao(), papeis);
  if (!r) throw new ErroDeNegocio(MSG_SEM_PERMISSAO);
  return r;
}

/** Nucleo do SUPER_ADMIN (qualquer host). `false` = recusado (ja na trilha). */
export async function avaliarSuperAdmin(s: SessaoAtiva): Promise<boolean> {
  if (s.papelPlataforma === "SUPER_ADMIN") return true;
  await registrarRecusa(s, "SUPER_ADMIN");
  return false;
}

export async function exigirSuperAdmin(): Promise<SessaoAtiva> {
  const s = await exigirSessao();
  if (!(await avaliarSuperAdmin(s))) throw new ErroDeNegocio(MSG_SEM_PERMISSAO);
  return s;
}
