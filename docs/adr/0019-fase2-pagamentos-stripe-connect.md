# ADR-0019: Fase 2 — pagamentos por Stripe Connect (direct charges, Checkout hospedado, taxa por criador)

- **Status**: Aceito
- **Data**: 2026-10-18
- **Decisores**: Paulo (Bah! Tech), dono do produto

## Contexto

A plataforma está em produção e cada criador precisa vender os próprios cursos. O dono do produto
decidiu: cada CRIADOR conecta a própria conta Stripe; a plataforma ganha **8% por padrão, ajustável por
criador** (só o SUPER_ADMIN); a cobrança é **direct charge** (acontece NA conta do criador) com
**Checkout hospedado**; meios **cartão, Pix e boleto** em BRL (conta da plataforma brasileira, CNPJ);
afiliados só com **rastreio e comissão calculada** (o criador paga o afiliado por fora). Hotmart/Eduzz,
páginas de venda e funis ficam fora. Esta decisão fixa a camada de dados e o back-end (as telas vêm
depois, a partir de `docs/back.md` "Fase 2"). Migração `0013_fase2_pagamentos_stripe` **só aditiva**.

## Decisão

1. **SDK `stripe@23.0.0` fixo** (API `2026-09-30.endive`, a que a lib fixa) atrás da interface pequena
   `GatewayStripe` (`src/lib/pagamentos/stripe.ts`), como o `ClienteIA`: os testes usam o `StripeFalso`
   e **nunca** saem para a rede. Sem `STRIPE_SECRET_KEY` o gateway é `null`: actions respondem
   "Pagamentos não configurados nesta plataforma.", a rota de compra 503, o webhook 503 sem
   `STRIPE_WEBHOOK_SECRET`, e o worker de pagamentos não sobe. Nada mais do app muda.
2. **Conta conectada = antigo "Standard" por controller properties** (a doc do Stripe mapeia Standard
   para `stripe_dashboard.type=full`, `fees.payer=account`, `losses.payments=stripe`,
   `requirement_collection=stripe`; `full` não aceita outra combinação). `country: BR`. Onboarding por
   **Account Link** (`account_onboarding`, retorno/renovar em `/admin/configuracoes/pagamentos`). Uma conta
   viva por criador (índice parcial) e a criação com chave de idempotência `conta-criador-<id>` (dois
   cliques = a mesma conta). Status (`charges_enabled`, `payouts_enabled`, `details_submitted`) pelo
   `account.updated` e por releitura na API; evento mais velho que o último aplicado não volta o estado.
3. **Direct charge com Checkout hospedado**, sessão criada NA conta conectada (`stripeAccount`):
   avulso `payment_intent_data.application_fee_amount` (centavos); assinatura
   `subscription_data.application_fee_percent` (bps/100). O preço vai em `price_data` com o valor já com
   cupom — nada de Product/Price/Coupon para sincronizar no Stripe. Meios por
   `allowed_payment_method_types: [card, pix, boleto]`: na versão 23 da lib `payment_method_types` saiu
   da Checkout Session; a lista nova é um FILTRO sobre o que o Stripe já acha elegível (meio ativo na
   conta do criador e compatível com o modo), então Pix some sozinho onde não cabe (assinatura) em vez de
   a sessão falhar. Reembolso `refunds.create({ payment_intent, refund_application_fee: true })` na
   conta conectada (a taxa volta na mesma proporção).
4. **Dinheiro em centavos inteiros** (`integer`), exceção consciente à regra do `dinheiro()` numeric: é a
   unidade mínima do Stripe, exata e sem ponto flutuante — converter ida e volta seria o risco. Taxa e
   comissão em **basis points** (800 = 8%), arredondamento meio-para-cima **uma vez por cobrança** com
   BigInt (`porBps`). Comissão do afiliado = bps sobre **(valor − taxa da plataforma)**. A taxa fica em
   `criadores.taxa_plataforma_bps` (default 800, CHECK 0–5000); a venda e a assinatura **congelam** a
   delas (mudar a taxa vale para vendas novas; assinatura existente mantém o `application_fee_percent`).
5. **Webhook Connect** `POST /api/stripe/webhook` (apex): assinatura conferida sobre o **corpo cru** com
   `STRIPE_WEBHOOK_SECRET` (tolerância padrão de 5 min), recibo em **`stripe_eventos` (append-only**, na
   lista `APPEND_ONLY` do `db-migrar`) idempotente pelo id do evento, e fila `pagamentos` (5º Worker de
   `worker:certificados`, `jobId` = id do evento, 10 tentativas com backoff de 15 s, DLQ só com ids). O
   **criador vem da conta conectada** (`event.account` → `criadores_stripe_contas`), nunca de metadata;
   metadata (`venda_id`) só diz se a assinatura/fatura é NOSSA (a mesma conta pode vender outras coisas).
   **Sem payload no banco nem no Redis**: o worker relê o evento na API da conta (`events.retrieve`) —
   o evento traz nome e e-mail do comprador e a tabela não pode ser apagada (LGPD, como os disparos de
   e-mail). Fila fora do ar = 500 (o Stripe reenvia); reprocessar é idempotente.
6. **Acesso pelo `matricular`** (origem `COMPRA`, autor = sistema) com referência estável: avulso
   `stripe:<venda>:<produto>`, assinatura `stripe:<sub_…>:<produto>` (renovação estende a MESMA). Quem já
   tem acesso vitalício fica como está (sem referência: o reembolso desta venda não tira o que veio de
   outro lugar); prazo menor é estendido, nunca encurtado. Avulso: `dias_acesso` da oferta (nulo = sem
   fim). Assinatura: fim do período + **3 dias de tolerância**, estendido a cada `invoice.paid` de
   `subscription_cycle` (uma venda nova por fatura); `customer.subscription.deleted` (ou status final)
   **cancela** as matrículas da assinatura. Reembolso TOTAL de avulso cancela as matrículas da venda;
   reembolso pelo DONO de venda de assinatura também cancela a assinatura no Stripe.
7. **Comprador**: logado na área = a compra é dele (e-mail fixo no Checkout); visitante = o Stripe pede o
   e-mail e, no pagamento, `vincularPessoa` (agora aceita autor nulo = sistema) cria a conta sem senha +
   vínculo ALUNO e o worker manda o link de primeiro acesso (sem SMTP, a pessoa usa "Esqueci a senha").
8. **Link de compra** `GET /api/stripe/checkout?oferta=&afiliado=&cupom=` no host do criador (é também o
   link do afiliado): teto de 20 por IP em 10 min no banco, afiliado inválido ignorado, cupom inválido
   recusa, 303 para o Checkout. Limite de uso do cupom contado em vendas AGUARDANDO_PAGAMENTO/PAGA, sem
   trava (ponytail: dois Checkouts no mesmo instante passam 1 do limite).

## Alternativas Consideradas

- **Destination charges / Express**: a plataforma seria o comerciante de registro e pagaria as taxas e
  disputas do Stripe; o dono quer o criador com Dashboard próprio e responsável pelas taxas.
- **Product/Price/Coupon no Stripe**: exigiria sincronizar catálogo e cupons em cada conta conectada;
  `price_data` resolve sem estado duplicado.
- **Guardar o payload do evento**: evita uma chamada por evento, mas deixaria dado pessoal num registro
  que não se apaga. Reler na API custa uma chamada e ainda confirma que o evento existe naquela conta.
- **Accounts v2 (`/v2/core/accounts`)**: as controller properties da v1 são a forma documentada para
  o "Standard" e cobrem o que precisamos; migrar quando a v2 trouxer algo que falte.

## Consequências

### Positivas
- Cada criador recebe direto na conta dele; a plataforma recebe a taxa na mesma cobrança.
- Reprocessar qualquer evento é seguro (recibo único, referência da matrícula, `fatura_id` único).
- Testes cobrem isolamento, idempotência, reembolso e assinatura sem rede.

### Negativas / Trade-offs
- Uma chamada à API por evento (releitura) e uma por fatura de assinatura (PaymentIntent da fatura).
- Cupom em assinatura vale para todas as cobranças (o preço da assinatura já nasce com desconto).
- Comissão de afiliado só na primeira venda (renovação não comissiona); pagamento ao afiliado é manual.
- Reembolso feito pelo Dashboard do Stripe numa assinatura não cancela a assinatura sozinho.

### Fica para depois
- Telas (Configurações › Pagamentos, Vendas, Assinaturas, Ofertas, Cupons, Afiliados, taxa em /plataforma).
- Cancelar assinatura pela tela do aluno/equipe; troca de taxa propagada às assinaturas existentes.
- Disputas (`charge.dispute.*`), páginas de venda, Hotmart/Eduzz.
