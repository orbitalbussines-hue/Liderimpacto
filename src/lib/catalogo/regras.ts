import type { StatusModulo, StatusProduto, TipoProduto } from "@/lib/db/schema/_enums";

/** Regras PURAS do catalogo (tela e action usam as mesmas). */

export const ROTULO_TIPO_PRODUTO: Record<TipoProduto, string> = { CURSO: "Curso online", MENTORIA: "Mentoria", EVENTO: "Evento" };
export const ROTULO_STATUS_PRODUTO: Record<StatusProduto, string> = { PUBLICADO: "Publicado", NAO_LISTADO: "Não listado", RASCUNHO: "Rascunho" };
export const ROTULO_STATUS_MODULO: Record<StatusModulo, string> = { PUBLICADO: "Publicado", RASCUNHO: "Rascunho" };

export interface EstadoParaPublicar {
  titulo: string;
  temCapa16x9: boolean;
  /** Modulos PUBLICADOS (vivos) com ao menos uma aula viva. */
  modulosComAula: number;
}

/**
 * O que falta para sair de RASCUNHO (PUBLICADO ou NAO_LISTADO: os dois ficam visiveis para quem
 * tem matricula). Lista vazia = pode publicar.
 */
export function pendenciasParaPublicar(p: EstadoParaPublicar): string[] {
  const faltas: string[] = [];
  if (p.titulo.trim().length < 2) faltas.push("título");
  if (p.modulosComAula < 1) faltas.push("ao menos 1 módulo publicado com 1 aula");
  if (!p.temCapa16x9) faltas.push("capa 16:9");
  return faltas;
}

export const mensagemDePendencias = (faltas: readonly string[]) => `Para publicar, falta: ${faltas.join("; ")}.`;

/** "Cód. 164 · 28 aulas · 0 alunos" (alunos = 0 ate as matriculas do passo 4). */
export function resumoDoProduto(p: { codigo: number; aulas: number; alunos: number }): string {
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  return `Cód. ${p.codigo} · ${plural(p.aulas, "aula", "aulas")} · ${plural(p.alunos, "aluno", "alunos")}`;
}
