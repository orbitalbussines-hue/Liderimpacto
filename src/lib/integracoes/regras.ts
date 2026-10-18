import type { PlataformaIntegracao, SituacaoEventoIntegracao, TipoEventoIntegracao } from "@/lib/db/schema/_enums";
import { TOLERANCIA_ASSINATURA_DIAS } from "@/lib/pagamentos/regras";

/**
 * Regras PURAS das integrações Hotmart e Eduzz (ADR-0021, RN-230 a RN-236): tradução do JSON de cada
 * plataforma para um evento nosso, a referência estável da matrícula, o prazo do acesso e os rótulos da
 * tela. Sem banco nem `node:crypto` (a tela importa). A autenticidade fica em `autenticidade.ts`.
 */

export const DIA_MS = 86_400_000;
/** Corpo maior que isto é recusado sem ler (os eventos reais têm poucos KB). */
export const TAMANHO_MAXIMO_CORPO = 64 * 1024;
/** Recibos RECUSADOS gravados por conexão em 10 min (o resto só responde 401: sem inundar a tabela). */
export const TETO_RECUSAS_POR_CONEXAO = 20;
export const ID_EXTERNO = /^[A-Za-z0-9_-]{1,100}$/;
export const PRODUTO_EXTERNO = /^[A-Za-z0-9_-]{1,64}$/;
/** Hottok / chave de assinatura: 8 a 200 caracteres visíveis, sem espaço. */
export const SEGREDO_EXTERNO = /^[\x21-\x7E]{8,200}$/;

export const ROTULO_PLATAFORMA: Record<PlataformaIntegracao, string> = { HOTMART: "Hotmart", EDUZZ: "Eduzz" };
/** Nome do segredo como cada plataforma chama. */
export const NOME_DO_TOKEN: Record<PlataformaIntegracao, string> = { HOTMART: "Hottok", EDUZZ: "Chave secreta" };
export const SEGMENTO_URL: Record<PlataformaIntegracao, string> = { HOTMART: "hotmart", EDUZZ: "eduzz" };
export const plataformaDoSegmento = (s: string): PlataformaIntegracao | null => (s === "hotmart" ? "HOTMART" : s === "eduzz" ? "EDUZZ" : null);

export const ROTULO_TIPO_EVENTO: Record<TipoEventoIntegracao, string> = {
  COMPRA_APROVADA: "Compra aprovada",
  REEMBOLSO: "Reembolso",
  CHARGEBACK: "Chargeback",
  CANCELAMENTO: "Compra cancelada",
  ASSINATURA_CANCELADA: "Assinatura cancelada",
  ASSINATURA_ATRASADA: "Assinatura atrasada",
  OUTRO: "Outro evento",
};

export type SituacaoNaTela = SituacaoEventoIntegracao | "RECUSADO";
export const ROTULO_SITUACAO_EVENTO: Record<SituacaoNaTela, string> = {
  PENDENTE: "Na fila",
  PROCESSADO: "Processado",
  SEM_MAPEAMENTO: "Sem mapeamento",
  IGNORADO: "Ignorado",
  ERRO: "Erro",
  RECUSADO: "Recusado",
};
export const REPROCESSAVEIS: readonly SituacaoEventoIntegracao[] = ["SEM_MAPEAMENTO", "ERRO"];

/** URL que o dono cola na plataforma externa (apex, como o webhook do Stripe). */
export const urlDoWebhook = (base: string, plataforma: PlataformaIntegracao, id: string) => `${base.replace(/\/+$/, "")}/api/integracoes/${SEGMENTO_URL[plataforma]}/${id}`;

// ---------- tradução do evento ----------

export interface EventoNormalizado {
  /** Id do recibo (id do evento; Eduzz com vários itens: `<id>-<n>` a partir do 2º). */
  eventoId: string;
  evento: string;
  tipo: TipoEventoIntegracao;
  transacao: string | null;
  assinatura: string | null;
  produtoExterno: string | null;
  email: string | null;
  nome: string | null;
  proximaCobranca: Date | null;
  ocorridoEm: Date | null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const texto = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null);
const id = (v: unknown, re = ID_EXTERNO) => {
  const t = texto(v)?.trim() ?? null;
  return t && re.test(t) ? t : null;
};
const data = (v: unknown): Date | null => {
  const d = typeof v === "number" ? new Date(v) : typeof v === "string" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
const email = (v: unknown) => {
  const t = texto(v)?.trim().toLowerCase() ?? null;
  return t && t.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null;
};
const nome = (v: unknown) => {
  const t = texto(v)?.replace(/[<>]/g, "").trim().slice(0, 120) ?? null;
  return t && t.length >= 2 ? t : null;
};

const TIPOS_HOTMART: Record<string, TipoEventoIntegracao> = {
  PURCHASE_APPROVED: "COMPRA_APROVADA",
  PURCHASE_COMPLETE: "COMPRA_APROVADA",
  PURCHASE_REFUNDED: "REEMBOLSO",
  PURCHASE_CHARGEBACK: "CHARGEBACK",
  PURCHASE_CANCELED: "CANCELAMENTO",
  PURCHASE_DELAYED: "ASSINATURA_ATRASADA",
  SUBSCRIPTION_CANCELLATION: "ASSINATURA_CANCELADA",
};

/** Hotmart Webhook 2.0.0: `{ id, event, version, creation_date, data: { product, buyer, purchase, subscription } }`. */
export function normalizarHotmart(json: unknown): EventoNormalizado[] | null {
  const raiz = obj(json);
  const eventoId = id(raiz.id);
  const evento = texto(raiz.event)?.slice(0, 60) ?? null;
  if (!eventoId || !evento) return null;
  const d = obj(raiz.data);
  const compra = obj(d.purchase);
  const pessoa = Object.keys(obj(d.buyer)).length ? obj(d.buyer) : obj(d.subscriber);
  const assinatura = id(obj(obj(d.subscription).subscriber).code) ?? id(obj(d.subscriber).code);
  return [
    {
      eventoId,
      evento,
      tipo: TIPOS_HOTMART[evento] ?? "OUTRO",
      transacao: id(compra.transaction),
      assinatura,
      produtoExterno: id(obj(d.product).id, PRODUTO_EXTERNO),
      email: email(pessoa.email),
      nome: nome(pessoa.name),
      proximaCobranca: data(compra.date_next_charge ?? d.date_next_charge),
      ocorridoEm: data(raiz.creation_date),
    },
  ];
}

const TIPOS_EDUZZ: Record<string, TipoEventoIntegracao> = {
  "myeduzz.invoice_paid": "COMPRA_APROVADA",
  "myeduzz.invoice_refunded": "REEMBOLSO",
  "myeduzz.invoice_chargeback": "CHARGEBACK",
  "myeduzz.invoice_canceled": "CANCELAMENTO",
};
/** `contract.status` da Eduzz que encerram (cancelado/finalizado/suspenso) ou só atrasam a assinatura. */
const CONTRATO_ENCERRADO = new Set(["canceled", "finished", "suspended"]);
const CONTRATO_ATRASADO = new Set(["late", "defaulter"]);

/**
 * Eduzz (Developer Hub): `{ id, event, data, sentDate }`. Fatura (`myeduzz.invoice_*`): `data.id` é a
 * fatura, `data.items[].productId` os produtos, `data.student`/`data.buyer` a pessoa; `data.contract.id`
 * vira a assinatura quando algum item é `billingType: "recurrence"`. Contrato (`myeduzz.contract_*`):
 * `data.contract.status` diz se a assinatura acabou. Um evento com N produtos vira N recibos.
 */
export function normalizarEduzz(json: unknown): EventoNormalizado[] | null {
  const raiz = obj(json);
  const eventoId = id(raiz.id);
  const evento = texto(raiz.event)?.slice(0, 60) ?? null;
  if (!eventoId || !evento) return null;
  const d = obj(raiz.data);
  const ocorridoEm = data(raiz.sentDate);
  const contrato = obj(d.contract);

  if (evento.startsWith("myeduzz.contract_")) {
    const status = texto(contrato.status) ?? "";
    const tipo: TipoEventoIntegracao = CONTRATO_ENCERRADO.has(status) ? "ASSINATURA_CANCELADA" : CONTRATO_ATRASADO.has(status) ? "ASSINATURA_ATRASADA" : "OUTRO";
    const cliente = obj(d.customer);
    return [{ eventoId, evento, tipo, transacao: null, assinatura: id(contrato.id), produtoExterno: null, email: email(cliente.email), nome: nome(cliente.name), proximaCobranca: null, ocorridoEm }];
  }

  const tipo = TIPOS_EDUZZ[evento] ?? "OUTRO";
  const itens = Array.isArray(d.items) ? d.items.map(obj) : [];
  const recorrente = itens.some((i) => i.billingType === "recurrence");
  const pessoa = email(obj(d.student).email) ? obj(d.student) : obj(d.buyer);
  const base = {
    evento,
    tipo,
    transacao: id(d.id),
    assinatura: recorrente ? id(contrato.id) : null,
    email: email(pessoa.email),
    nome: nome(pessoa.name),
    proximaCobranca: null,
    ocorridoEm,
  };
  const produtos = [...new Set(itens.map((i) => id(i.productId, PRODUTO_EXTERNO)).filter((p): p is string => !!p))];
  if (produtos.length === 0) return [{ ...base, eventoId, produtoExterno: null }];
  return produtos.map((produtoExterno, i) => ({ ...base, eventoId: i === 0 ? eventoId : `${eventoId}-${i + 1}`.slice(0, 100), produtoExterno }));
}

export const normalizar = (plataforma: PlataformaIntegracao, json: unknown) => (plataforma === "HOTMART" ? normalizarHotmart(json) : normalizarEduzz(json));

// ---------- acesso ----------

/**
 * Chave da compra na referência da matrícula: assinatura = a MESMA matrícula a cada renovação
 * (`hotmart-assinatura:<código>`); compra avulsa = `hotmart:<transação>`. Prefixo para encerrar = `chave:`.
 */
export function chaveDoAcesso(plataforma: PlataformaIntegracao, e: { transacao: string | null; assinatura: string | null }): string | null {
  const p = SEGMENTO_URL[plataforma];
  if (e.assinatura) return `${p}-assinatura:${e.assinatura}`;
  return e.transacao ? `${p}:${e.transacao}` : null;
}
export const referenciaDoAcesso = (chave: string, produtoId: string) => `${chave}:${produtoId}`;

/**
 * Até quando vale o acesso de um curso mapeado: assinatura com próxima cobrança informada = ela +
 * tolerância (RN-217); senão os dias do mapeamento; sem dias = vitalício (nulo).
 */
export function acessoAte(p: { proximaCobranca: Date | null; diasAcesso: number | null }, agora: Date): Date | null {
  if (p.proximaCobranca) return new Date(p.proximaCobranca.getTime() + TOLERANCIA_ASSINATURA_DIAS * DIA_MS);
  return p.diasAcesso === null ? null : new Date(agora.getTime() + p.diasAcesso * DIA_MS);
}

/** Últimos 4 do segredo (a tela identifica sem mostrar). */
export const finalDoSegredo = (segredo: string) => segredo.slice(-4);
