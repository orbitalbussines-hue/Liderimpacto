import {
  Award,
  CirclePlay,
  ClipboardList,
  House,
  MessageCircle,
  Route,
  User,
  type LucideIcon,
} from "lucide-react";

export interface ItemNavegacao {
  href: string;
  rotulo: string;
  icone: LucideIcon;
}

/** Fonte única da navegação do aluno: menu do desktop e tab bar do celular. */
const INICIO = { href: "/", rotulo: "Início", icone: House };
const CONTINUAR = { href: "/continuar", rotulo: "Continuar", icone: CirclePlay };
const TRILHAS = { href: "/trilhas", rotulo: "Trilhas", icone: Route };
const COMUNIDADE = { href: "/comunidade", rotulo: "Comunidade", icone: MessageCircle };

/** Menu em pílulas do header (desktop). */
export const ITENS_MENU: readonly ItemNavegacao[] = [
  INICIO,
  CONTINUAR,
  TRILHAS,
  { href: "/avaliacoes", rotulo: "Avaliações", icone: ClipboardList },
  COMUNIDADE,
  { href: "/certificados", rotulo: "Certificados", icone: Award },
];

/** Tab bar inferior (celular): 5 abas, "Continuar" vira "Aulas". */
export const ITENS_TAB_BAR: readonly ItemNavegacao[] = [
  INICIO,
  { ...CONTINUAR, rotulo: "Aulas" },
  TRILHAS,
  COMUNIDADE,
  { href: "/perfil", rotulo: "Perfil", icone: User },
];

/**
 * Href do item ativo para o `pathname`, ou null. `/` só ativa Início no exato `/`;
 * os demais ativam no próprio caminho e nos filhos (`/trilhas/abc` ativa Trilhas).
 * Rotas fora da lista (ex.: `/cursos/x`) não ativam nada.
 */
export function itemAtivo(pathname: string, itens: readonly ItemNavegacao[]): string | null {
  const achado = itens.find(({ href }) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)
  );
  return achado?.href ?? null;
}
