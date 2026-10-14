import type { AbaTabela } from "@/components/admin/pagina-tabela";
import type { PapelCriador } from "@/lib/db/schema/_enums";

export const ROTULO_PAPEL: Record<PapelCriador, string> = { DONO: "Dono", ADMIN: "Admin", ALUNO: "Aluno" };

/** Abas das telas de Membros (as do protótipo sem rota ainda aparecem como "Em breve"). */
export const ABAS_MEMBROS: AbaTabela[] = [
  { rotulo: "Membros", href: "/admin/membros" },
  { rotulo: "Grupos de acesso", href: "/admin/membros/grupos" },
  { rotulo: "Vouchers", emBreve: true },
  { rotulo: "Gamificação", href: "/admin/membros/gamificacao" },
  { rotulo: "Tags", emBreve: true },
];

/** 21/09/26, no fuso de Brasília. */
export const dataCurta = (d: Date) =>
  d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
