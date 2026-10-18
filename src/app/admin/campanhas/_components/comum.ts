import type { AbaTabela } from "@/components/admin/pagina-tabela";
import type { TomSelo } from "@/components/admin/tabela-tipos";
import type { SituacaoCampanha, SituacaoEnvio } from "@/lib/db/schema/_enums";
import type { ConteudoMarketing, PublicoCampanha } from "@/lib/db/schema/marketing";

/** Abas de Campanhas (segmentos substituem listas). */
export const ABAS_CAMPANHAS: AbaTabela[] = [
  { rotulo: "Campanhas", href: "/admin/campanhas" },
  { rotulo: "Modelos", href: "/admin/campanhas/modelos" },
  { rotulo: "Descadastros", href: "/admin/campanhas/descadastros" },
];

export const TOM_SITUACAO_CAMPANHA: Record<SituacaoCampanha, TomSelo> = { RASCUNHO: "neutro", AGENDADA: "accent", ENVIANDO: "accent", CONCLUIDA: "ok", CANCELADA: "warn" };
export const TOM_SITUACAO_ENVIO: Record<SituacaoEnvio, TomSelo> = { PENDENTE: "neutro", ENVIADO: "ok", FALHOU: "warn", IGNORADO: "neutro" };

export const CONTEUDO_VAZIO: ConteudoMarketing = { assunto: "", previa: "", titulo: "", corpo: "", botao: null };

/** Mesmo formato do `PUBLICO_TODOS` (regras.ts importa schema só como tipo, mas mantém a tela leve). */
export const PUBLICO_VAZIO: PublicoCampanha = { grupoIds: [], tagIds: [], produtoIds: [], nuncaAcessou: false };

/** "1 pessoa" / "138 pessoas". */
export const pessoas = (n: number) => `${n.toLocaleString("pt-BR")} ${n === 1 ? "pessoa" : "pessoas"}`;

/**
 * Quanto tempo a fila leva para mandar `n` e-mails pelo teto da plataforma (RN-222), arredondado
 * para 10 min. É estimativa: o teto conta também os e-mails de senha que saem no meio.
 */
export function tempoEstimado(n: number, limite: { hora: number; dia: number }): string {
  if (n <= 0) return "";
  if (n > limite.dia) return `cerca de ${Math.ceil(n / limite.dia)} dias`;
  const minutos = Math.ceil((n / limite.hora) * 6) * 10;
  if (minutos <= 60) return "em até 1 hora";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `cerca de ${h}h${m ? String(m).padStart(2, "0") : ""}`;
}
