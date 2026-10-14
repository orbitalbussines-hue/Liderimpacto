import type { AbaTabela } from "@/components/admin/pagina-tabela";
import type { AbaEventos } from "@/lib/eventos/admin";
import type { PublicoEvento } from "@/lib/db/schema/_enums";

/** Público por extenso ("Todos os alunos", "Alunos de Liderança 360", "2 grupos"). */
export function textoDoPublico(publico: PublicoEvento, curso: string | null, grupos: number): string {
  if (publico === "PRODUTO") return curso ? `Alunos de ${curso}` : "Alunos de um curso";
  if (publico === "GRUPOS") return grupos === 1 ? "1 grupo" : `${grupos} grupos`;
  return "Todos os alunos";
}

export const ROTULO_ABA: Record<AbaEventos, string> = { proximos: "Próximos", passados: "Passados", rascunhos: "Rascunhos", cancelados: "Cancelados" };

export const hrefAba = (a: AbaEventos) => (a === "proximos" ? "/admin/eventos" : `/admin/eventos?aba=${a}`);

export const ABAS_EVENTOS_TABELA: AbaTabela[] = (Object.keys(ROTULO_ABA) as AbaEventos[]).map((a) => ({ rotulo: ROTULO_ABA[a], href: hrefAba(a) }));
