/** Tipos de curso, módulo e aula (visão do aluno). */

export type EstadoAula = "concluida" | "atual" | "pendente";

export interface AulaResumo {
  id: string;
  titulo: string;
  duracao: string;
  estado: EstadoAula;
  href: string;
}

export type EstadoModulo = "concluido" | "andamento" | "bloqueado";

export interface ModuloCurso {
  id: string;
  /** "01", "02"... */
  numero: string;
  titulo: string;
  totalAulas: number;
  duracao: string;
  estado: EstadoModulo;
  /** Lista de aulas; vazia = módulo sem expansão (concluído/bloqueado no protótipo). */
  aulas: AulaResumo[];
}

export interface GrupoAulas {
  id: string;
  titulo: string;
  aulas: AulaResumo[];
}
