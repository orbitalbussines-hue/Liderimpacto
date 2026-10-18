/** Estúdio de vídeo: as três abas (cada uma é uma rota) e a leitura de searchParams. */

export const ROTA_ESTUDIO = "/admin/estudio-de-video";

export const ABAS_ESTUDIO = [
  { rotulo: "Vídeos", href: ROTA_ESTUDIO },
  { rotulo: "Estatísticas", href: `${ROTA_ESTUDIO}/estatisticas` },
  { rotulo: "IA", href: `${ROTA_ESTUDIO}/ia` },
] as const;

export type Busca = Promise<Record<string, string | string[] | undefined>>;

/** Primeiro valor do parâmetro, sem espaços; vazio = undefined. */
export const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

export const numero = (n: number) => n.toLocaleString("pt-BR");
