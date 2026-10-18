# ADR-0021: Integrações de venda externa — Hotmart e Eduzz (webhook autenticado, recibo append-only, fila)

- **Status**: Aceito
- **Data**: 2026-10-18
- **Decisores**: Paulo (Bah! Tech), dono do produto

## Contexto

Parte dos criadores já vende na Hotmart ou na Eduzz e não vai trocar de checkout. A plataforma precisa
liberar o acesso sozinha quando a venda acontece lá e tirar quando ela é desfeita. O desenho segue o do
webhook do Stripe (ADR-0019): webhook autenticado, recibo idempotente sem payload, fila e `matricular`
com origem COMPRA e referência estável. Migração `0015_integracoes_hotmart_eduzz` **só aditiva**
(4 tabelas novas).

Documentação oficial consultada em 2026-10-18 (links em bloco para o detector de drift não os ler como
caminhos do repositório):

```text
Hotmart Webhook 2.0.0
  https://developers.hotmart.com/docs/en/2.0.0/webhook/purchase-webhook/
  https://developers.hotmart.com/docs/en/2.0.0/webhook/cancel-subscription-webhook/
  https://developers.hotmart.com/docs/en/tutorials/use-webhook-for-subscriptions/
  https://help.hotmart.com/en/article/360001491352/how-do-i-set-up-my-product-s-api-using-the-webhook-postback-
  (fixtures de SDK aberto que segue a doc) https://github.com/trichains/hotmart-webhooks
Eduzz Developer Hub
  https://developers.eduzz.com/docs/webhook          (+ /create, /security, /activate, /ping)
  https://developers.eduzz.com/api/openapi           (schemas dos eventos myeduzz.*)
```

- **Hotmart**: o site de desenvolvedores devolveu 403 (CloudFront) para leitura automática; o formato foi
  conferido pelos trechos indexados da doc (hottok "unique per account", enviado no cabeçalho
  `X-HOTMART-HOTTOK`; `event`, `version` 2.0.0; `SUBSCRIPTION_CANCELLATION`) e pelas fixtures do SDK:
  `id`, `creation_date` (ms), `data.product.id`, `data.buyer.{email,name}`,
  `data.purchase.{transaction,status,offer.code,recurrence_number,date_next_charge}`,
  `data.subscription.subscriber.code`; no cancelamento, `data.subscriber.code` e `data.date_next_charge`.
- **Eduzz**: envelope `{ id, event, data, sentDate }`; eventos `myeduzz.invoice_paid`, `_refunded`,
  `_canceled`, `_chargeback`, `myeduzz.contract_updated`; fatura com `data.id`,
  `data.items[].productId`/`billingType`, `data.buyer`/`data.student`, `data.contract.id`; contrato com
  `data.contract.status` (`upToDate`, `late`, `canceled`, `defaulter`, `suspended`, `finished`...).
  Validação: cabeçalho `x-signature` = `hmac('sha256', chave_secreta, corpo_da_requisição)`.

## Decisão

1. **Uma conexão por (criador, plataforma)** em `criadores_integracoes`, com o segredo da plataforma
   (Hottok ou chave da Eduzz — o dono COPIA de lá; não somos nós que geramos) guardado **cifrado** pelo
   mesmo `cifrarSegredo` dos webhooks de saída (AES-256-GCM, chave HKDF do `BETTER_AUTH_SECRET`), com AAD
   `integracao:<id>`: copiar a cifra para outra conexão não decifra. Tela e trilha só veem os 4 finais.
2. **URL com o id da conexão**: `https://<apex>/api/integracoes/hotmart/<id>` e `/eduzz/<id>`. O id diz
   QUAL segredo conferir e de QUAL criador é o evento (nunca o corpo). Não é a credencial: a credencial é
   o hottok/assinatura. Alternativa "token na URL" descartada: a Hotmart já manda o hottok no cabeçalho e
   a Eduzz assina o corpo, então um segredo na URL seria um segundo segredo, vazável em log de proxy, sem
   ganho. Apex como o Stripe: um endereço fixo, independente do subdomínio da área.
3. **Autenticidade em tempo constante**: Hotmart compara o `X-HOTMART-HOTTOK` com o hottok; Eduzz recalcula
   o HMAC-SHA256 do **corpo cru** e compara com `x-signature`. Toda comparação é `timingSafeEqual` sobre o
   SHA-256 dos dois lados (`src/lib/integracoes/autenticidade.ts`). Token errado = 401 e recibo
   `RECUSADO` (no máximo 20 por conexão a cada 10 min, para um robô não encher a tabela). Corpo > 64 KB = 413.
4. **Recibo append-only** `integracoes_recibos` (na lista `APPEND_ONLY` do `db-migrar`), idempotente por
   `(integracao_id, evento_id)`, **sem payload nem dado pessoal**: só ids (evento, transação, assinatura,
   produto externo), o tipo traduzido e quando. Diferente do Stripe, Hotmart e Eduzz não permitem reler o
   evento com o token do webhook, então o comprador (e-mail e nome) fica na linha MUTÁVEL de processamento
   `criadores_integracoes_eventos` só enquanto o evento pode ser reprocessado (PENDENTE, SEM_MAPEAMENTO,
   ERRO) e é apagado (nulo) ao virar PROCESSADO/IGNORADO. Nada de comprador no Redis: o job leva só o id.
5. **Fila `integracoes`** (8º Worker de `worker:certificados`, concorrência 1, `jobId` = id do evento,
   6 tentativas com backoff de 15 s, DLQ só com ids). Fila fora do ar = 500 (a plataforma reenvia; o
   reenvio acha o recibo e só enfileira de novo) e o worker reenfileira os PENDENTES ao subir. Falha
   inesperada tenta de novo; na última vira ERRO (o dono reprocessa). Erro de negócio vira ERRO na hora.
6. **Acesso pelo `matricular`** via `concederAcesso`/`encerrarAcesso` da Fase 2 (origem COMPRA, autor =
   sistema). Referência estável: compra avulsa `hotmart:<transação>:<curso>` / `eduzz:<fatura>:<curso>`;
   assinatura `hotmart-assinatura:<código do assinante>:<curso>` / `eduzz-assinatura:<contrato>:<curso>` (a
   renovação estende a MESMA matrícula). Comprador novo: `vincularPessoa` (autor nulo) + ALUNO + e-mail de
   primeiro acesso depois do commit (`depoisDaVenda`, agora exportado do processador do Stripe).
7. **Tradução dos eventos** (`normalizarHotmart`/`normalizarEduzz`, puros): Hotmart `PURCHASE_APPROVED` e
   `PURCHASE_COMPLETE` = compra aprovada; `PURCHASE_REFUNDED`, `PURCHASE_CHARGEBACK`, `PURCHASE_CANCELED` =
   encerram; `PURCHASE_DELAYED` = atrasada (não corta); `SUBSCRIPTION_CANCELLATION` = assinatura cancelada.
   Eduzz `invoice_paid` = aprovada; `invoice_refunded`, `invoice_chargeback`, `invoice_canceled` = encerram;
   `contract_updated` com status `canceled`/`finished`/`suspended` = assinatura cancelada, `late`/`defaulter`
   = atrasada. O resto (ping, boleto impresso, abandono) é registrado e IGNORADO. Fatura da Eduzz com N
   produtos = N recibos (`<id>`, `<id>-2`...), cada um pelo seu mapeamento.
8. **Prazo**: assinatura com data da próxima cobrança (Hotmart) = ela + 3 dias (RN-217); senão os dias do
   mapeamento; sem dias = vitalício. Cancelamento de assinatura com a data da cobrança ainda no futuro
   LIMITA o acesso a ela (o período pago vale); data passada ou ausente encerra na hora.
9. **Ordem**: aprovação que chega depois de reembolso/chargeback/cancelamento da mesma transação, ou depois
   do cancelamento (mais novo) da mesma assinatura, é IGNORADA. Reembolso de cobrança de assinatura sem o
   código no evento usa o código gravado no recibo da aprovação da mesma transação.
10. **Produto sem mapeamento** = SEM_MAPEAMENTO (com o comprador guardado); "Reprocessar" (só DONO, só
    SEM_MAPEAMENTO/ERRO, trava por `updated_at`) volta para PENDENTE e enfileira.

## Dúvidas da documentação (decidido o mais seguro)

- **Eduzz, codificação da `x-signature`**: a doc não diz se é hex ou base64 nem se é o corpo cru.
  Aceitamos **hex (qualquer caixa) ou base64**, sempre sobre o corpo cru. Conferir no primeiro evento real
  (o ping da ativação aparece em Últimos eventos como "Ignorado" se passou, "Recusado" se não).
- **Eduzz, sem proteção de replay** documentada (sem carimbo de tempo assinado). O recibo idempotente
  impede efeito duplo; um replay de evento antigo só repete o que já foi aplicado.
- **Eduzz, próxima cobrança**: a fatura não traz o vencimento seguinte. Por isso a assinatura da Eduzz
  usa os dias do mapeamento (ou vitalício até o contrato cancelar).
- **Eduzz, order bump**: o exemplo traz itens com `isBump` e `orderBump.mainSaleId`; liberamos todo
  `productId` distinto da fatura que tiver mapeamento.
- **Hotmart, hottok rotacionado**: a doc diz que a troca do hottok é pelo suporte; a tela tem "Trocar hottok".
- **Hotmart, `PURCHASE_PROTEST`** (pedido de reembolso aberto) é só registrado: o acesso cai no
  `PURCHASE_REFUNDED`/`PURCHASE_CHARGEBACK`.

## Alternativas Consideradas

- **Token próprio na URL**: ver item 2.
- **Guardar o payload no recibo**: reprocessar ficaria trivial, mas o recibo não se apaga (LGPD).
- **Usar a API da Hotmart/Eduzz para reler o evento** (como o Stripe): exige credenciais OAuth extras do
  criador (client id/secret) e mais uma configuração para errar; o webhook já traz o necessário.

## Consequências

### Positivas
- Compra fora libera o acesso em segundos; reembolso tira; reprocessar é seguro e idempotente.
- Isolamento pelo id da conexão + segredo dela; nenhum dado de comprador em Redis, log ou trilha do recibo.

### Negativas / Trade-offs
- Compra SEM_MAPEAMENTO guarda o e-mail até ser mapeada (ponytail: sem expurgo automático; um job de
  limpeza depois de N dias resolve se acumular).
- A trilha do `vincularPessoa` (compartilhado com o Stripe) registra o e-mail da pessoa vinculada, como já
  acontece na Fase 2 (o visualizador da trilha mascara).

### Fica para depois
- Outras plataformas (Kiwify, Monetizze): é um `normalizar*` novo + `PLATAFORMAS_INTEGRACAO`.
- Expurgo do comprador de eventos SEM_MAPEAMENTO antigos; reprocessar em lote.
