import type { AbaTabela } from "@/components/admin/pagina-tabela";

/** Abas de Admin > Matrículas (rotas próprias, como Desafios). "Correção" virou "Tentativas extras" (ADR-0018). */
export const ABAS_MATRICULAS: AbaTabela[] = [
  { rotulo: "Matrículas", href: "/admin/matriculas" },
  { rotulo: "Progresso", href: "/admin/matriculas/progresso" },
  { rotulo: "Feedbacks de conteúdo", href: "/admin/matriculas/feedbacks" },
  { rotulo: "Avaliações", href: "/admin/matriculas/avaliacoes" },
  { rotulo: "Tentativas extras", href: "/admin/matriculas/tentativas-extras" },
];

export const POR_PAGINA = 20;

export type Busca = Promise<Record<string, string | string[] | undefined>>;

/** searchParams são entrada do usuário: primeiro valor, sem espaço, vazio = ausente. */
export const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Só passa UUID (o resto vira "sem filtro"). */
export const uuid = (v: string | string[] | undefined) => {
  const s = um(v);
  return s && UUID.test(s) ? s : undefined;
};

export const lerPagina = (v: string | string[] | undefined) => Math.max(1, Math.min(10_000, Number.parseInt(um(v) ?? "1", 10) || 1));
export const lerBusca = (v: string | string[] | undefined) => um(v)?.slice(0, 100);

/** Link da própria tela trocando só os filtros de `mudar` (página volta para 1 se não vier). */
export function linkCom(base: string, atual: Record<string, string | undefined>, mudar: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...atual, pagina: undefined, ...mudar })) if (v) p.set(k, v);
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Campos escondidos do form de busca: reenvia os filtros que estão valendo. */
export const manter = (atual: Record<string, string | undefined>) =>
  Object.fromEntries(Object.entries(atual).filter((e): e is [string, string] => !!e[1] && e[0] !== "q" && e[0] !== "pagina"));

/** "há 3 dias" (até 30 dias); depois disso a data curta. */
export function haQuanto(d: Date, agora: Date, dataCurta: (d: Date) => string): string {
  const min = Math.floor((agora.getTime() - d.getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.floor(h / 24);
  if (dias <= 30) return dias === 1 ? "ontem" : `há ${dias} dias`;
  return dataCurta(d);
}
