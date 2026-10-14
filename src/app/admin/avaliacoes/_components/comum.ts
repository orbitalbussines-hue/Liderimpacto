import type { TomSelo } from "@/components/admin/tabela-tipos";
import type { StatusAvaliacao } from "@/lib/db/schema/_enums";

export const ROTULO_STATUS_AVALIACAO: Record<StatusAvaliacao, string> = { RASCUNHO: "Rascunho", PUBLICADA: "Publicada" };
export const TOM_STATUS_AVALIACAO: Record<StatusAvaliacao, TomSelo> = { RASCUNHO: "neutro", PUBLICADA: "ok" };

/** 0..1 → "72%" (nulo = "—"). */
export const percentual = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
