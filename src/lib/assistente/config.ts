import "server-only";
import { and, eq } from "drizzle-orm";
import { db, type Transacao } from "@/lib/db";
import { criadores_assistentes as assistentes, criadores_assistentes_produtos as assistentesProdutos, produtos } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { LIMITES_ASSISTENTE } from "./regras";

/** Configuração do assistente do criador (sem linha = desligado, com os padrões). */
export interface ConfigAssistente {
  id: string | null;
  ligado: boolean;
  nome: string;
  instrucoes: string;
  limiteDiario: number;
  todosOsCursos: boolean;
  /** Cursos escolhidos (vivos) quando `todosOsCursos` é falso. */
  produtos: string[];
  versao: Date | null;
}

export const NOME_PADRAO = "Assistente do professor";

export async function configDoAssistente(criadorId: string, exec: Transacao | typeof db = db): Promise<ConfigAssistente> {
  const [c] = await exec.select().from(assistentes).where(and(eq(assistentes.criador_id, criadorId), vivos(assistentes)));
  if (!c) return { id: null, ligado: false, nome: NOME_PADRAO, instrucoes: "", limiteDiario: LIMITES_ASSISTENTE.limiteDiarioPadrao, todosOsCursos: true, produtos: [], versao: null };
  const lista = await exec
    .select({ id: assistentesProdutos.produto_id })
    .from(assistentesProdutos)
    .innerJoin(produtos, and(eq(produtos.id, assistentesProdutos.produto_id), vivos(produtos)))
    .where(and(eq(assistentesProdutos.criador_id, criadorId), vivos(assistentesProdutos)));
  return {
    id: c.id,
    ligado: c.ligado,
    nome: c.nome,
    instrucoes: c.instrucoes,
    limiteDiario: c.limite_diario,
    todosOsCursos: c.todos_os_cursos,
    produtos: lista.map((p) => p.id),
    versao: c.updated_at,
  };
}

/** Cursos que a recuperação pode usar (null = todos). */
export const produtosDaBusca = (c: ConfigAssistente): string[] | null => (c.todosOsCursos ? null : c.produtos);

/** O painel "Pergunte ao professor" aparece neste curso? */
export const apareceNoCurso = (c: ConfigAssistente, produtoId: string): boolean => c.ligado && (c.todosOsCursos || c.produtos.includes(produtoId));
