# ADR-0025: Página de vendas própria do criador como quarta integração de venda

- **Status**: Aceito
- **Data**: 2026-11-15
- **Decisores**: Paulo (Bah! Tech)

## Contexto

O livro Liderança Inteligente é vendido numa página própria (repositório separado, checkout InfinitePay, envio pelo
Melhor Envio). A compra dá direito às 10 aulas e aos 3 materiais aqui na plataforma. A página já manda, a cada
pagamento confirmado, um aviso assinado (arquivo lider.ts do repositório da página), mas nada aqui o recebia: o acesso era liberado à mão
e compradores reclamaram de não receber os materiais (15/11/2026).

Corpo do aviso: `{ id: "LI-...", evento: "compra_aprovada", produto: "lideranca-inteligente", valor_centavos,
pago_em, comprador: { nome, email, cpf, telefone } }`, com `x-assinatura: sha256=<hex>` = HMAC-SHA256 do corpo cru
com o segredo combinado, e `x-evento-id` = o id do pedido.

## Decisão

A página entra como a plataforma `PAGINA` do framework do ADR-0021, sem caminho novo:

1. Conexão por criador em `/admin/vendas/integracoes` (card "Página de vendas"), segredo cifrado como o hottok; URL
   `/api/integracoes/pagina/<id>` vai em `LIDER_WEBHOOK_URL` da página e o segredo em `LIDER_WEBHOOK_SEGREDO`.
2. Autenticidade: o mesmo esquema do Bling (`sha256=<hex>` do corpo cru, tempo constante), lido de `x-assinatura`.
3. Tradução (`normalizarPagina`): o id do pedido é o evento **e** a transação; `compra_aprovada` = COMPRA_APROVADA,
   qualquer outro evento = OUTRO (só registrado). CPF e telefone são descartados na tradução.
4. Mapeamento e matrícula iguais à Hotmart: `lideranca-inteligente` → um ou mais cursos; referência
   `pagina:<pedido>:<curso>`, então o "Reenviar aviso de acesso" do painel da página não duplica.

Migração `0020_integracao_pagina_de_vendas`: só amplia os dois CHECKs de plataforma.

## Consequências

- Liberação automática para toda compra paga; as compras pagas antes da ligação entram pelo "Reenviar aviso".
- A página não avisa reembolso nem cancelamento: tirar o acesso nesses casos continua manual (Matrículas).
- O segredo precisa ter 32 caracteres ou mais (a página recusa menos que isso e desliga o aviso).
