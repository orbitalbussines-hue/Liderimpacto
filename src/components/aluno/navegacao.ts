import {
  Award,
  CalendarDays,
  CirclePlay,
  ClipboardList,
  House,
  MessageCircle,
  Route,
  Trophy,
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
  // No celular não cabe na tab bar: o acesso é pelo cartão "Próximo encontro ao vivo" da comunidade e pelos avisos do sino.
  { href: "/eventos", rotulo: "Eventos", icone: CalendarDays },
  { href: "/certificados", rotulo: "Certificados", icone: Award },
];

/** Conquistas (pontos, ranking, desafios): só com a gamificação ligada; no celular, pelo Perfil. */
export const ITEM_CONQUISTAS: ItemNavegacao = { href: "/conquistas", rotulo: "Conquistas", icone: Trophy };

/** Itens do menu do desktop para a área: Conquistas entra antes de Certificados quando ligada. */
export function itensDoMenu({ conquistas }: { conquistas: boolean }): readonly ItemNavegacao[] {
  if (!conquistas) return ITENS_MENU;
  const i = ITENS_MENU.findIndex((x) => x.href === "/certificados");
  return [...ITENS_MENU.slice(0, i), ITEM_CONQUISTAS, ...ITENS_MENU.slice(i)];
}

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
