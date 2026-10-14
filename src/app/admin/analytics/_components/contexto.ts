import "server-only";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { cursosCacheados } from "@/lib/analytics/cache";
import type { CursoOpcao } from "@/lib/analytics/consultas";
import { lerAba, lerCurso, lerOrdem, type FiltrosAnalytics } from "@/lib/analytics/regras";
import { hojeEmBrasilia, lerIntervalo, type Intervalo } from "@/lib/painel/periodo";

export type ParametrosAnalytics = Promise<Record<string, string | string[] | undefined>>;

export interface ContextoAnalytics {
  criadorId: string;
  filtros: Required<FiltrosAnalytics>;
  /** Período em vigor (`?de=&ate=`, legado `?periodo=`, padrão últimos 30 dias). */
  periodo: Intervalo;
  /** Hoje em Brasília ("AAAA-MM-DD"): teto do seletor e base das frases. */
  hoje: string;
  cursos: CursoOpcao[];
  /** Título do curso filtrado (nulo = todos). */
  cursoTitulo: string | null;
}

/**
 * Cada bloco confere sessão e papel (EQUIPE, lido do banco) por conta própria e só DEPOIS lê o
 * cache. Curso da URL que não é deste criador vira "todos os cursos" (e a consulta filtraria
 * mesmo assim: tudo leva `criador_id`).
 */
export async function contextoAnalytics(parametros: ParametrosAnalytics): Promise<ContextoAnalytics> {
  const { criador } = await membroDaPagina(EQUIPE);
  const p = await parametros;
  const cursos = await cursosCacheados(criador.id);
  const pedido = lerCurso(p.curso);
  const curso = cursos.find((c) => c.id === pedido) ?? null;
  const hoje = hojeEmBrasilia();
  const periodo = lerIntervalo(p, hoje);
  return {
    criadorId: criador.id,
    filtros: { aba: lerAba(p.aba), periodo, curso: curso?.id ?? null, ordem: lerOrdem(p.ordem) },
    periodo,
    hoje,
    cursos,
    cursoTitulo: curso?.titulo ?? null,
  };
}
