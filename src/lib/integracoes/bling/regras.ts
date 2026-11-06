import type { SituacaoAutorizacaoIntegracao, SituacaoPedidoMarketplace, TipoEventoIntegracao } from "@/lib/db/schema/_enums";
import type { EventoNormalizado } from "../regras";

/**
 * Regras PURAS do Bling (ADR-0024, RN-260 a RN-266): endereços da API v3, tradução do aviso
 * (`order.created|updated|deleted`), leitura do pedido da API, número do pedido no marketplace e CPF.
 * Sem banco nem `node:crypto` (a tela importa). HMAC do CPF em `cpf.ts`; chamadas em `api.ts`.
 */

/** API v3 (developer.bling.com.br, OpenAPI `servers` e "Aplicativos › Códigos de acesso"). */
export const URL_AUTORIZAR_BLING = "https://www.bling.com.br/Api/v3/oauth/authorize";
export const URL_TOKEN_BLING = "https://api.bling.com.br/Api/v3/oauth/token";
export const URL_API_BLING = "https://api.bling.com.br/Api/v3";
/** `situacao.valor` do pedido de venda: 2 = Cancelado (lista "Situações da venda" da doc). */
export const SITUACAO_CANCELADO_BLING = 2;
/** Access token dura 21600 s (6 h) pela doc; renovamos com folga. */
export const FOLGA_TOKEN_MS = 5 * 60_000;
export const VALIDADE_TOKEN_PADRAO_S = 21_600;
/** client_id do app no Bling (o exemplo da doc tem 37 hex); folga para formato futuro. */
export const CLIENTE_ID_BLING = /^[A-Za-z0-9_-]{8,100}$/;

/** Caminho (na ÁREA do criador, onde vive o cookie da sessão) que o Bling chama de volta com o `code`. */
export const CAMINHO_RETORNO_BLING = "/admin/vendas/integracoes/bling/retorno";
export const urlDeRetornoBling = (urlDaArea: string) => `${urlDaArea.replace(/\/+$/, "")}${CAMINHO_RETORNO_BLING}`;

export const ROTULO_AUTORIZACAO: Record<SituacaoAutorizacaoIntegracao, string> = { AGUARDANDO: "Falta autorizar", AUTORIZADA: "Autorizado", REAUTORIZAR: "Reautorizar" };
export const ROTULO_PEDIDO: Record<SituacaoPedidoMarketplace, string> = { VALIDO: "Válido", CANCELADO: "Cancelado" };

// ---------- número do pedido e CPF ----------

/** Número do pedido no marketplace como o comprador digita: sem espaços; caixa não importa na comparação. */
export const normalizarNumeroLoja = (s: string) => s.replace(/\s+/g, "");
/** Mercado Livre e TikTok Shop usam dígitos; aceitamos letras, `-`, `_`, `.` e `/` por folga. */
export const RE_NUMERO_LOJA = /^[A-Za-z0-9._/-]{3,60}$/;

export const soDigitos = (s: string) => s.replace(/\D+/g, "");

/** CPF com os dois dígitos verificadores certos (e não repetido tipo 111.111.111-11). */
export function cpfValido(entrada: string): boolean {
  const c = soDigitos(entrada);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(c[i]) * (ate + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

// ---------- aviso (webhook) ----------

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const texto = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null);
const idNumerico = (v: unknown) => {
  const t = texto(v)?.trim() ?? null;
  return t && /^[0-9]{1,20}$/.test(t) ? t : null;
};
const ID_EVENTO = /^[A-Za-z0-9_-]{1,100}$/;

const TIPOS_BLING: Record<string, TipoEventoIntegracao> = { "order.created": "PEDIDO_ATUALIZADO", "order.updated": "PEDIDO_ATUALIZADO", "order.deleted": "PEDIDO_EXCLUIDO" };

/**
 * Webhook do Bling: `{ eventId, date, version, event: "<recurso>.<ação>", companyId, data }`. Pedido de
 * venda (`order.*`): `data.id` é o pedido (no `deleted`, só ele). O conteúdo do aviso NÃO é usado para
 * decidir: o worker relê o pedido na API (o Bling repete e não garante ordem). Outro recurso = OUTRO.
 */
export function normalizarBling(json: unknown): EventoNormalizado[] | null {
  const raiz = obj(json);
  const eventoId = texto(raiz.eventId)?.trim() ?? null;
  const evento = texto(raiz.event)?.slice(0, 60) ?? null;
  if (!eventoId || !ID_EVENTO.test(eventoId) || !evento) return null;
  const tipo = TIPOS_BLING[evento] ?? "OUTRO";
  const pedido = idNumerico(obj(raiz.data).id);
  if (tipo !== "OUTRO" && !pedido) return null;
  const d = new Date(texto(raiz.date) ?? "");
  return [
    {
      eventoId,
      evento,
      tipo,
      transacao: tipo === "OUTRO" ? null : pedido,
      assinatura: null,
      produtoExterno: null,
      email: null,
      nome: null,
      proximaCobranca: null,
      ocorridoEm: Number.isNaN(d.getTime()) ? null : d,
    },
  ];
}

// ---------- pedido lido na API ----------

export interface PedidoLido {
  id: string;
  numeroLoja: string | null;
  numero: string | null;
  lojaId: string | null;
  contatoId: string | null;
  /** Documento do contato só com dígitos (CPF = 11). Nunca gravado: vira HMAC. */
  documento: string | null;
  skus: string[];
  situacaoValor: number | null;
}

/** `GET /pedidos/vendas/{id}` → `{ data: { id, numero, numeroLoja, contato: { id, numeroDocumento }, situacao: { valor }, loja: { id }, itens: [{ codigo }] } }`. */
export function lerPedidoBling(json: unknown): PedidoLido | null {
  const d = obj(obj(json).data);
  const id = idNumerico(d.id);
  if (!id) return null;
  const numeroLoja = normalizarNumeroLoja(texto(d.numeroLoja) ?? "").slice(0, 60) || null;
  const contato = obj(d.contato);
  const documento = soDigitos(texto(contato.numeroDocumento) ?? "") || null;
  const itens = Array.isArray(d.itens) ? d.itens.map(obj) : [];
  const skus = [...new Set(itens.map((i) => texto(i.codigo)?.trim() ?? "").filter((s) => s.length >= 1 && s.length <= 64))];
  const valor = obj(d.situacao).valor;
  return {
    id,
    numeroLoja,
    numero: texto(d.numero)?.slice(0, 20) ?? null,
    lojaId: idNumerico(obj(d.loja).id),
    contatoId: idNumerico(contato.id),
    documento,
    skus,
    situacaoValor: typeof valor === "number" && Number.isInteger(valor) ? valor : null,
  };
}

/** `GET /pedidos/vendas?numerosLojas[]=` → ids dos pedidos achados (no máximo 5). */
export function idsDaListaDePedidos(json: unknown): string[] {
  const lista = obj(json).data;
  if (!Array.isArray(lista)) return [];
  return lista.map((p) => idNumerico(obj(p).id)).filter((x): x is string => !!x).slice(0, 5);
}

export const situacaoDoPedido = (p: Pick<PedidoLido, "situacaoValor"> | null): SituacaoPedidoMarketplace =>
  !p || p.situacaoValor === SITUACAO_CANCELADO_BLING ? "CANCELADO" : "VALIDO";

/** Prefixo das matrículas de um pedido (encerrar no cancelamento): `bling:<pedido>:`. */
export const prefixoDoPedido = (pedidoId: string) => `bling:${pedidoId}:`;
