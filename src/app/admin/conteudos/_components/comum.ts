import type { TomSelo } from "@/components/admin/tabela-tipos";
import type { StatusProduto } from "@/lib/db/schema/_enums";

/** Selo da situação do produto (protótipo: Publicado verde, Não listado vermelho). */
export const TOM_STATUS_PRODUTO: Record<StatusProduto, TomSelo> = { PUBLICADO: "ok", NAO_LISTADO: "warn", RASCUNHO: "neutro" };

/** "23/08/26 · 13:31", no fuso de Brasília. */
export function dataHoraCurta(d: Date): string {
  const fuso = { timeZone: "America/Sao_Paulo" } as const;
  const data = d.toLocaleDateString("pt-BR", { ...fuso, day: "2-digit", month: "2-digit", year: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { ...fuso, hour: "2-digit", minute: "2-digit" });
  return `${data} · ${hora}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Parâmetro de rota é entrada do usuário: só passa UUID. */
export const ehUuid = (v: string) => UUID.test(v);
