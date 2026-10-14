import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { db } from "@/lib/db";
import { criadores, criadores_membros, usuarios } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { MSG_SEM_PERMISSAO } from "./autorizacao";
import { motivoParaNaoGerarLink, type AlvoDoLink } from "./link-de-senha-regra";
import { papelEfetivo } from "./permissoes";
import { gerarLinkDeSenha, type LinkDeSenha } from "./recuperacao";
import type { SessaoAtiva } from "./sessao";
import { estourouTeto } from "./teto";

/** Vinculos VIVOS (qualquer status) da conta-alvo, mais antigo primeiro, com o slug do criador. */
async function lerAlvo(usuarioId: string): Promise<(AlvoDoLink & { slugs: Map<string, string> }) | null> {
  const [u] = await db
    .select({ id: usuarios.id, papel: usuarios.papel_plataforma })
    .from(usuarios)
    .where(and(eq(usuarios.id, usuarioId), vivos(usuarios)));
  if (!u) return null;
  const vinculos = await db
    .select({ criadorId: criadores_membros.criador_id, papel: criadores_membros.papel, slug: criadores.slug })
    .from(criadores_membros)
    .innerJoin(criadores, eq(criadores.id, criadores_membros.criador_id))
    .where(and(eq(criadores_membros.usuario_id, usuarioId), vivos(criadores_membros), vivos(criadores)))
    .orderBy(asc(criadores_membros.created_at));
  return {
    id: u.id,
    papelPlataforma: u.papel,
    vinculos: vinculos.map(({ criadorId, papel }) => ({ criadorId, papel })),
    slugs: new Map(vinculos.map((v) => [v.criadorId, v.slug])),
  };
}

/**
 * A equipe gera o link de primeiro acesso/redefinicao e ele aparece NA TELA para copiar
 * (ADR-0003). Quem pode, para quem: `motivoParaNaoGerarLink` (regra pura, travada por teste).
 * O link sai no host da area de quem gera; o SUPER_ADMIN no apex gera no host do vinculo
 * mais antigo da pessoa (ou no apex, se ela nao tiver vinculo). Teto: 20 links por ator / 10 min.
 */
export async function emitirLinkDeSenha(ator: SessaoAtiva, alvoUsuarioId: string, motivo: string): Promise<LinkDeSenha> {
  if (await estourouTeto(`link-senha:${ator.userId}`, 600, 20)) throw new ErroDeNegocio("Muitos links gerados. Aguarde alguns minutos.");
  const alvo = await lerAlvo(alvoUsuarioId);
  if (!alvo) throw new ErroDeNegocio("Usuário não encontrado.");
  const criadorDoAtor = ator.alvo.tipo === "criador" ? ator.alvo.criador : null;
  const recusa = motivoParaNaoGerarLink(
    { id: ator.userId, superAdmin: ator.acesso.superAdmin, criadorId: criadorDoAtor?.id ?? null, papel: papelEfetivo(ator.acesso) },
    alvo,
  );
  if (recusa) throw new ErroDeNegocio(recusa === "sem-permissao" ? MSG_SEM_PERMISSAO : recusa);
  let area = criadorDoAtor ? { id: criadorDoAtor.id, slug: criadorDoAtor.slug } : null;
  if (!area && alvo.vinculos[0]) area = { id: alvo.vinculos[0].criadorId, slug: alvo.slugs.get(alvo.vinculos[0].criadorId)! };
  return gerarLinkDeSenha(alvo.id, area, { id: ator.userId, motivo });
}
