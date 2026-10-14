import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { criadores_membros, usuarios } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";

/**
 * Leitura da tela "Meu perfil": dados da PESSOA da sessão (nunca de parâmetro) e desde quando ela
 * é membro do criador do host. `versao` = `updated_at` ISO (trava da action `acaoSalvarPerfil`).
 */
export async function dadosDoPerfil(usuarioId: string, criadorId: string) {
  const [u] = await db
    .select({
      nome: usuarios.nome,
      email: usuarios.email,
      imagem: usuarios.imagem,
      whatsapp: usuarios.whatsapp,
      empresaCargo: usuarios.empresa_cargo,
      versao: usuarios.updated_at,
      criadoEm: usuarios.created_at,
    })
    .from(usuarios)
    .where(and(eq(usuarios.id, usuarioId), vivos(usuarios)));
  if (!u) return null;
  const [m] = await db
    .select({ desde: criadores_membros.created_at })
    .from(criadores_membros)
    .where(and(eq(criadores_membros.usuario_id, usuarioId), eq(criadores_membros.criador_id, criadorId), vivos(criadores_membros)));
  return { ...u, versao: u.versao.toISOString(), membroDesde: m?.desde ?? u.criadoEm };
}
