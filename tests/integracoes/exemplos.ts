/**
 * Payloads de EXEMPLO da Hotmart (Webhook 2.0.0) e da Eduzz (Developer Hub, `myeduzz.*`), no formato
 * das documentações oficiais (ADR-0021), com dados ANONIMIZADOS (e-mails `@teste.local`, nomes e ids
 * fictícios). Puro: serve ao teste de unidade e ao de integração. Nada sai para a rede.
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";

const aleatorio = () => randomBytes(5).toString("hex");
export const emailFicticio = () => `comprador-${aleatorio()}@teste.local`;
export const transacaoHotmart = () => `HP${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`;

interface OpcoesHotmart {
  id?: string;
  evento?: string;
  transacao?: string;
  produtoId?: number;
  email?: string;
  nome?: string;
  assinante?: string | null;
  proximaCobranca?: Date | null;
  criadoEm?: Date;
}

/** Evento de compra (PURCHASE_*) como a Hotmart manda. */
export function hotmartCompra(o: OpcoesHotmart = {}) {
  const status: Record<string, string> = { PURCHASE_APPROVED: "APPROVED", PURCHASE_COMPLETE: "COMPLETED", PURCHASE_REFUNDED: "REFUNDED", PURCHASE_CHARGEBACK: "CHARGEBACK", PURCHASE_CANCELED: "CANCELLED", PURCHASE_DELAYED: "OVERDUE" };
  const evento = o.evento ?? "PURCHASE_APPROVED";
  const criado = (o.criadoEm ?? new Date()).getTime();
  return {
    id: o.id ?? randomUUID(),
    creation_date: criado,
    event: evento,
    version: "2.0.0",
    data: {
      product: { id: o.produtoId ?? 1000001, ucode: randomUUID(), name: "Curso Exemplo de Liderança", has_co_production: false },
      buyer: { email: o.email ?? emailFicticio(), name: o.nome ?? "Maria Exemplo", first_name: "Maria", last_name: "Exemplo", checkout_phone: "5511900000000" },
      producer: { name: "Produtor Exemplo" },
      purchase: {
        transaction: o.transacao ?? transacaoHotmart(),
        status: status[evento] ?? "APPROVED",
        order_date: criado - 60_000,
        approved_date: criado,
        price: { value: 197, currency_value: "BRL" },
        offer: { code: "test0001" },
        payment: { type: "CREDIT_CARD", installments_number: 1 },
        ...(o.proximaCobranca ? { recurrence_number: 1, date_next_charge: o.proximaCobranca.getTime() } : {}),
      },
      ...(o.assinante ? { subscription: { status: "ACTIVE", plan: { id: 2000001, name: "Plano Mensal" }, subscriber: { code: o.assinante } } } : {}),
    },
  };
}

/** SUBSCRIPTION_CANCELLATION (sem `purchase`; assinante em `data.subscriber`). */
export function hotmartAssinaturaCancelada(o: { assinante: string; produtoId?: number; proximaCobranca?: Date | null; criadoEm?: Date }) {
  const criado = (o.criadoEm ?? new Date()).getTime();
  return {
    id: randomUUID(),
    creation_date: criado,
    event: "SUBSCRIPTION_CANCELLATION",
    version: "2.0.0",
    data: {
      date_next_charge: o.proximaCobranca?.getTime() ?? null,
      product: { id: o.produtoId ?? 1000001, name: "Curso Exemplo de Liderança" },
      actual_recurrence_value: 49.9,
      subscriber: { code: o.assinante, name: "Maria Exemplo", email: emailFicticio() },
      subscription: { id: 3000001, plan: { id: 2000001, name: "Plano Mensal" } },
      cancellation_date: criado,
    },
  };
}

interface ItemEduzz {
  productId: string;
  billingType?: "single" | "recurrence";
  isBump?: boolean;
}

/** Fatura `myeduzz.invoice_*` como a Eduzz manda. */
export function eduzzFatura(o: { id?: string; evento?: string; faturaId?: string; itens?: ItemEduzz[]; email?: string; nome?: string; contratoId?: string | null } = {}) {
  const evento = o.evento ?? "myeduzz.invoice_paid";
  const email = o.email ?? emailFicticio();
  const pessoa = { id: "66677677767", name: o.nome ?? "Ana Exemplo", email, document: "00000000000" };
  return {
    id: o.id ?? `z${aleatorio()}${aleatorio()}`,
    event: evento,
    sentDate: new Date().toISOString(),
    data: {
      id: o.faturaId ?? String(Math.floor(Math.random() * 1e8)),
      status: evento.replace("myeduzz.invoice_", ""),
      buyer: pessoa,
      student: pessoa,
      producer: { id: "1454585458", name: "Produtor Exemplo", email: "produtor@teste.local" },
      offer: { name: "Oferta Base" },
      items: (o.itens ?? [{ productId: "P567" }]).map((i) => ({
        productId: i.productId,
        name: "Produto Exemplo",
        isBump: i.isBump ?? false,
        billingType: i.billingType ?? "single",
        price: { value: 150.75, currency: "BRL" },
        refundPeriod: { durationType: "days", value: 7 },
      })),
      price: { value: 301.5, currency: "BRL" },
      paid: { value: 301.5, currency: "BRL" },
      contract: o.contratoId ? { id: o.contratoId, isUnlimitedInstallments: false } : null,
      transaction: { id: "123456", key: "chave-ficticia" },
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      dueDate: new Date().toISOString(),
    },
  };
}

/** `myeduzz.contract_updated` (status do contrato/assinatura). */
export function eduzzContrato(o: { contratoId: string; status: string }) {
  return {
    id: `c${aleatorio()}${aleatorio()}`,
    event: "myeduzz.contract_updated",
    sentDate: new Date().toISOString(),
    data: {
      producer: { id: "123456", name: "Produtor Exemplo", email: "produtor@teste.local" },
      products: [{ id: "P567", name: "Produto Exemplo" }],
      contract: { id: o.contratoId, status: o.status, recurrence: { frequency: { type: "month", value: 1 } } },
      customer: { name: "Ana Exemplo", email: emailFicticio() },
      reason: o.status === "canceled" ? "cancellation" : "status_updated",
    },
  };
}

/** `x-signature` da Eduzz: HMAC-SHA256(chave, corpo cru) em hex. */
export const assinarEduzz = (chave: string, corpo: string) => createHmac("sha256", chave).update(corpo).digest("hex");
