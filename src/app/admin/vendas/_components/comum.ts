import type { TomSelo } from "@/components/admin/tabela-tipos";
import type { SituacaoAssinatura, SituacaoVenda } from "@/lib/db/schema/_enums";
import { somarDias, type Intervalo } from "@/lib/painel/periodo";
import { ABAS_VENDAS } from "./abas";

/** Rótulos e tons das telas de Vendas e financeiro (RN-215 a RN-217). */

export const ROTULO_SITUACAO_VENDA: Record<SituacaoVenda, string> = {
  PENDENTE: "Pendente",
  AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
  PAGA: "Paga",
  FALHOU: "Falhou",
  EXPIRADA: "Expirada",
  REEMBOLSADA: "Reembolsada",
};
export const TOM_SITUACAO_VENDA: Record<SituacaoVenda, TomSelo> = {
  PENDENTE: "neutro",
  AGUARDANDO_PAGAMENTO: "accent",
  PAGA: "ok",
  FALHOU: "warn",
  EXPIRADA: "neutro",
  REEMBOLSADA: "warn",
};

export const ROTULO_SITUACAO_ASSINATURA: Record<SituacaoAssinatura, string> = {
  ATIVA: "Ativa",
  ATRASADA: "Atrasada",
  PAUSADA: "Pausada",
  INCOMPLETA: "Incompleta",
  CANCELADA: "Cancelada",
};
export const TOM_SITUACAO_ASSINATURA: Record<SituacaoAssinatura, TomSelo> = {
  ATIVA: "ok",
  ATRASADA: "warn",
  PAUSADA: "neutro",
  INCOMPLETA: "accent",
  CANCELADA: "neutro",
};

/** Dias de Brasília (inclusivos) → instantes para a consulta: `de` 00:00 e `ate` = dia seguinte, exclusivo. Brasil sem horário de verão desde 2019. */
export const datasDoIntervalo = (i: Intervalo) => ({ de: new Date(`${i.de}T00:00:00-03:00`), ate: new Date(`${somarDias(i.ate, 1)}T00:00:00-03:00`) });

export const DASHBOARD_STRIPE = "https://dashboard.stripe.com/";

/** As mesmas abas, no formato da `MolduraAbas` (telas que não são tabela). */
export const ABAS_VENDAS_LINKS = ABAS_VENDAS.flatMap((a) => (typeof a === "object" && a.href ? [{ rotulo: a.rotulo, href: a.href }] : []));
