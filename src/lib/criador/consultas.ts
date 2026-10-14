import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { criadores } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";

/**
 * Todos os criadores vivos (area da PLATAFORMA), com o DONO mais antigo e o numero de membros.
 * Quem chama ja conferiu o SUPER_ADMIN. Colunas externas escritas com a tabela (ver sinais-fator.ts).
 */
const donoMaisAntigo = (coluna: "u.nome" | "u.email") =>
  sql.raw(
    `select ${coluna} from criadores_membros m join usuarios u on u.id = m.usuario_id where m.criador_id = "criadores"."id" and m.papel = 'DONO' and m.is_deleted = false order by m.created_at limit 1`,
  );

export async function listarCriadores() {
  return db
    .select({
      id: criadores.id,
      nome: criadores.nome,
      slug: criadores.slug,
      status: criadores.status,
      criadoEm: criadores.created_at,
      versao: criadores.updated_at,
      membros: sql<number>`(select count(*)::int from criadores_membros m where m.criador_id = "criadores"."id" and m.is_deleted = false)`,
      donoNome: sql<string | null>`(${donoMaisAntigo("u.nome")})`,
      donoEmail: sql<string | null>`(${donoMaisAntigo("u.email")})`,
    })
    .from(criadores)
    .where(vivos(criadores))
    .orderBy(asc(criadores.nome));
}

/** Cor da marca e versao (trava) do criador do HOST, para Configuracoes > Aparencia. */
export async function marcaDoCriador(criadorId: string) {
  const [c] = await db
    .select({ cor: criadores.cor_marca, versao: criadores.updated_at })
    .from(criadores)
    .where(and(eq(criadores.id, criadorId), vivos(criadores)));
  return c ?? null;
}

/** Configurações > Geral e Domínios: nome, slug, domínio próprio reservado e versão (trava). */
export async function dadosDaArea(criadorId: string) {
  const [c] = await db
    .select({ nome: criadores.nome, slug: criadores.slug, dominioProprio: criadores.dominio_proprio, versao: criadores.updated_at })
    .from(criadores)
    .where(and(eq(criadores.id, criadorId), vivos(criadores)));
  return c ?? null;
}

/**
 * Cartão da área principal no hub "Área de membros": membros ATIVOS (qualquer papel), alunos
 * ativos e cursos PUBLICADOS. Uma consulta, só do criador.
 */
export async function resumoDaArea(criadorId: string) {
  const r = await db.execute<{ membros: number; alunos: number; cursos: number }>(sql`
    select
      (select count(*)::int from criadores_membros m where m.criador_id = ${criadorId} and m.is_deleted = false and m.status = 'ATIVO') as membros,
      (select count(*)::int from criadores_membros m where m.criador_id = ${criadorId} and m.is_deleted = false and m.status = 'ATIVO' and m.papel = 'ALUNO') as alunos,
      (select count(*)::int from produtos p where p.criador_id = ${criadorId} and p.is_deleted = false and p.status = 'PUBLICADO') as cursos
  `);
  return r.rows[0] ?? { membros: 0, alunos: 0, cursos: 0 };
}
