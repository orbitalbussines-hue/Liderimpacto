import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import type { PapelCriador, PapelPlataforma } from "@/lib/db/schema/_enums";
import { criadores, criadores_membros } from "@/lib/db/schema/criadores";
import { vivos } from "@/lib/db/soft-delete";
import { criadorDoHost } from "./host";

/**
 * Area da requisicao, resolvida pelo HOST + banco. Sem Next aqui (o teste chama direto com
 * `Headers`); a versao com `headers()` e cache por requisicao e `atual.ts`.
 * O criador vem SEMPRE daqui — nunca do corpo da requisicao.
 */

export interface CriadorDaRequisicao {
  id: string;
  slug: string;
  nome: string;
  cor_marca: string | null;
}

export type AlvoDoHost = { tipo: "plataforma" } | { tipo: "criador"; criador: CriadorDaRequisicao };

/** O que a conta pode nesta area. `null` (em `acessoAoAlvo`) = nao entra aqui. */
export interface Acesso {
  superAdmin: boolean;
  /** Vinculo ATIVO no criador da requisicao (nulo na plataforma ou SUPER_ADMIN sem vinculo). */
  membro: { id: string; papel: PapelCriador } | null;
}

export function dominioDaPlataforma(): string {
  const dominio = process.env.PLATAFORMA_DOMINIO;
  if (!dominio) throw new Error("PLATAFORMA_DOMINIO ausente (produção: liderdeimpacto.com.br; dev: localhost).");
  return dominio;
}

/** Origem real da plataforma (protocolo + porta): BETTER_AUTH_URL; sem ela, https://<dominio>. */
export function urlDaPlataforma(): string {
  return process.env.BETTER_AUTH_URL ?? `https://${dominioDaPlataforma()}`;
}

/** `null` = host que nao e area nenhuma (slug invalido, criador inexistente ou SUSPENSO) -> 404. */
export async function alvoDosCabecalhos(h: Headers | null | undefined): Promise<AlvoDoHost | null> {
  const area = criadorDoHost(h?.get("host"), dominioDaPlataforma());
  // ponytail: dominio proprio ainda nao e ligado (so a coluna existe); responde 404 ate la.
  if (!area || area.tipo === "dominioProprio") return null;
  if (area.tipo === "plataforma") return area;
  const [criador] = await db
    .select({ id: criadores.id, slug: criadores.slug, nome: criadores.nome, cor_marca: criadores.cor_marca })
    .from(criadores)
    .where(and(eq(criadores.slug, area.slug), eq(criadores.status, "ATIVO"), vivos(criadores)));
  return criador ? { tipo: "criador", criador } : null;
}

/** Vinculo ATIVO e vivo da pessoa no criador. */
async function membroAtivo(usuarioId: string, criadorId: string) {
  const [m] = await db
    .select({ id: criadores_membros.id, papel: criadores_membros.papel })
    .from(criadores_membros)
    .where(
      and(
        eq(criadores_membros.usuario_id, usuarioId),
        eq(criadores_membros.criador_id, criadorId),
        eq(criadores_membros.status, "ATIVO"),
        vivos(criadores_membros),
      ),
    );
  return m ?? null;
}

/**
 * A conta entra nesta area? Plataforma: so SUPER_ADMIN. Criador: SUPER_ADMIN (suporte,
 * auditado no login) ou vinculo ATIVO. Lido do banco a cada chamada.
 */
export async function acessoAoAlvo(usuarioId: string, papelPlataforma: PapelPlataforma, alvo: AlvoDoHost): Promise<Acesso | null> {
  const superAdmin = papelPlataforma === "SUPER_ADMIN";
  if (alvo.tipo === "plataforma") return superAdmin ? { superAdmin, membro: null } : null;
  const membro = await membroAtivo(usuarioId, alvo.criador.id);
  if (!membro && !superAdmin) return null;
  return { superAdmin, membro };
}

export const criadorIdDo = (alvo: AlvoDoHost | null) => (alvo?.tipo === "criador" ? alvo.criador.id : null);
