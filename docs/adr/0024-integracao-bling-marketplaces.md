# ADR-0024: Pedidos de marketplace pelo Bling (Mercado Livre e TikTok Shop) e resgate público com pedido + CPF ou código

- **Status**: Aceito
- **Data**: 2026-10-31
- **Decisores**: Paulo (Bah! Tech), dono do produto

## Contexto

O livro (e o curso que vai com ele) passa a ser vendido no Mercado Livre e no TikTok Shop. Esses pedidos
chegam ao Bling (ERP do criador), não a um checkout nosso, e o comprador não tem conta aqui. A Amazon
**não** entra no Bling: lá a equipe manda um código de uso único pelo chat da Amazon (voucher da RN-201).

O comprador precisa liberar o curso sozinho, sem login, numa página pública, provando que o pedido é
dele. O desenho reaproveita o framework das integrações (ADR-0021: conexão por criador com segredo
cifrado, recibo append-only, fila `integracoes`, `matricular` com origem COMPRA e referência estável) e
o caminho "compra aprovada" da Hotmart (`vincularPessoa` + ALUNO + primeiro acesso depois do commit).
Migração `0018_integracao_bling_marketplaces` **só aditiva** (3 tabelas novas; os CHECKs de plataforma e de
tipo de evento só ganham valores).

Documentação oficial consultada em 2026-10-31 (em bloco para o detector de drift não ler como caminho):

```text
https://developer.bling.com.br/aplicativos      (criar app, Link de redirecionamento, escopos, OAuth 2.0 authorization code)
https://developer.bling.com.br/webhooks         (cadastro, envelope v1, X-Bling-Signature-256, entrega e reenvio)
https://developer.bling.com.br/limites          (3 req/s, 120 mil/dia; 20 chamadas a /oauth/token por minuto por IP)
https://developer.bling.com.br/migracao-jwt     (cabeçalho enable-jwt: 1; token opaco descontinuado)
https://developer.bling.com.br/referencia       (OpenAPI: GET /pedidos/vendas e /pedidos/vendas/{id})
```

Confirmado na doc:

- **App**: Central de Extensões › Área do Integrador › Criar aplicativo; "Link de redirecionamento" e a
  lista de escopos ficam no cadastro do app; Client ID e Client Secret em "Informações do app".
- **OAuth**: `GET https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=&state=`
  (o `redirect_uri` e os escopos vêm do cadastro do app); o `code` vale 30 s. Troca e renovação em
  `POST https://api.bling.com.br/Api/v3/oauth/token` com `Authorization: Basic base64(client_id:client_secret)`
  (credencial no corpo não é aceita), corpo form-urlencoded `grant_type=authorization_code&code=` ou
  `grant_type=refresh_token&refresh_token=`. Resposta `{ access_token, expires_in: 21600, token_type, scope,
  refresh_token }`; o refresh token vale 30 dias. `enable-jwt: 1` em toda chamada.
- **Webhook**: configurado na aba Webhooks do app (URL do servidor; recurso, ações e versão). Envelope
  `{ eventId, date, version: "v1", event: "<recurso>.<ação>", companyId, data }`; pedido de venda =
  `order.created` / `order.updated` / `order.deleted` (no `deleted`, `data` só tem `id`), escopo
  "Pedidos de Venda". Assinatura `X-Bling-Signature-256: sha256=<hex>` = HMAC-SHA256 do corpo JSON com o
  **client secret** do app. Exige 2xx em até 5 s; reenvia por até 3 dias e depois desativa o recurso;
  pode repetir e não garante ordem. Só começa depois da autorização.
- **Pedido**: `GET /pedidos/vendas?numerosLojas[]=` (filtro pelo número do marketplace) e
  `GET /pedidos/vendas/{id}` → `data.{ id, numero, numeroLoja, contato.{ id, numeroDocumento }, situacao.{ id, valor },
  loja.id, itens[].codigo }`. Situação (`valor`): 0 Em aberto, 1 Atendido, 2 Cancelado, 3 Em andamento,
  5/6 parcial, 7 Aguardando pagamento, 8 Pagamento confirmado, 10 Em digitação, 11 Verificado, 12 Checkout parcial.

## Decisão

1. **Conexão BLING** em `criadores_integracoes` (uma viva por criador), com o **client secret** como o
   segredo cifrado (mesma AAD `integracao:<id>`): ele autentica o webhook E a troca de token. O OAuth fica
   em `criadores_integracoes_oauth` (client_id, tokens cifrados com AAD própria `bling-tokens:<id>`,
   validade, situação AGUARDANDO/AUTORIZADA/REAUTORIZAR, erro curto). Tabela à parte para a renovação do
   token não mexer no `updated_at` (trava de colisão) da conexão. Tela e trilha só veem os 4 finais.
2. **Webhook**: mesma rota e mesmo recibo da ADR-0021 (`/api/integracoes/bling/<id>`), assinatura conferida
   em tempo constante (`assinaturaBlingConfere`). O aviso **não decide nada**: o worker relê o pedido na
   API (fora da transação) e o estado atual vence — cobre repetição, fora de ordem e aviso perdido.
3. **Espelho do pedido** em `criadores_integracoes_pedidos`: número da loja (sem espaços), número, loja,
   SKUs, situação VALIDO/CANCELADO e **só o HMAC do CPF** (HMAC-SHA256 de `<criador>:<11 dígitos>`, chave
   HKDF do `BETTER_AUTH_SECRET`, info `cpf-pedidos:v1`). O CPF nunca é gravado, nem no recibo nem na
   trilha. O criador entra no HMAC: o mesmo CPF não correlaciona entre áreas. Nada é matriculado no aviso.
4. **Situação**: `valor === 2` (Cancelado) ou pedido que não existe mais = CANCELADO; qualquer outra
   situação = VALIDO. Ficar CANCELADO encerra (`encerrarAcesso`) só as matrículas com referência
   `bling:<pedido>:` — RN-265.
5. **OAuth**: callback na área do criador (`<área>/admin/vendas/integracoes/bling/retorno`), porque o
   cookie de sessão é por host; só DONO. O `state` é `<integração>.<expira>.<nonce>.<mac>`, mac HMAC (HKDF
   `bling-estado:v1`) que cobre também a sessão e a pessoa, válido 10 min. Token renovado quando faltam
   menos de 5 min, com a linha travada (`for update`) para app e worker não renovarem juntos; job diário
   `renovar-bling` (04:00, Brasília) no worker mantém o refresh vivo. Refresh recusado = REAUTORIZAR na tela.
6. **Cliente pequeno** com `fetch` nativo (`src/lib/integracoes/bling/api.ts`), prazo de 10 s; 401 renova e
   tenta uma vez; 403 = falta escopo; 404 = pedido não existe.
7. **Resgate público** em `/resgatar-pedido` (área do criador, sem login, `noindex`), com duas portas:
   - (a) **Número do pedido + CPF + nome + e-mail** (Mercado Livre/TikTok Shop): casa pelo número (sem caixa)
     e pelo HMAC do CPF; se o número não está no espelho, **UMA** busca por `numerosLojas[]` na API antes
     de recusar. Deu certo: `vincularPessoa` + ALUNO + `concederAcesso` (origem COMPRA, referência
     `bling:<pedido>:<curso>`, prazo do mapeamento SKU → curso) e o primeiro acesso depois do commit.
     **Um resgate por pedido** (índice único + trava da linha); o segundo recebe "já resgatado" com o e-mail
     mascarado (só depois de o CPF bater).
   - (b) **Tenho um código + nome + e-mail** (Amazon): o `resgatarVoucher` inteiro (trava, validade,
     limites, "já tem acesso") com a pessoa criada/vinculada como ALUNO na MESMA transação — recusa
     desfaz tudo, nenhuma conta nasce de código errado.
   - Defesas das duas: mensagem de recusa **única** por porta (não diz se o número existe, se o CPF está
     errado, se o SKU não está mapeado, nem se o código expirou/esgotou), teto **persistido** no banco por
     IP (10 / 15 min, as duas portas somam) e por pedido/código (5 / 15 min), trilha `acesso_negado` com o
     motivo real e o IP, nunca o CPF. Conta existente entra com a senha de sempre; o `/resgatar` logado
     continua igual.

## Dúvidas da documentação

- O exemplo do webhook traz `situacao.valor` genérico; usamos o `valor` da referência (2 = Cancelado).
  Situações personalizadas foram assumidas como herdando o `valor` da situação base.
- A doc não diz se o refresh token **rotaciona**. Se a resposta não trouxer um novo, o antigo continua.
- A página de migração JWT mostra `/oauth/token` sem `/Api/v3`; usamos a URL com `/Api/v3` (a da página de
  aplicativos). `Accept: 1.0` foi mantido como na doc.
- `contato.numeroDocumento` pode vir vazio dependendo do canal (o marketplace pode não repassar o CPF):
  pedido "sem CPF" fica no espelho e não resgata (sem consulta extra a `/contatos`). Compra com CNPJ não
  resgata por CPF.
- No Mercado Livre o `numeroLoja` pode ser o número do **pacote** e não o da venda; o comprador precisa
  digitar o número como aparece no Bling. Validar com um pedido real antes de divulgar.
- O SKU (`itens[].codigo`) precisa caber em `^[A-Za-z0-9_-]{1,64}$` (CHECK do mapeamento); SKU com espaço
  ou ponto não mapeia.
- Pedido "Em aberto" já conta como válido (o Bling só recebe o pedido do marketplace depois do pagamento).

## Alternativas consideradas

- **Matricular no aviso, pelo e-mail do pedido**: descartado — marketplace mascara/omite o e-mail do
  comprador; a pessoa escolhe o e-mail no resgate.
- **Guardar o CPF cifrado**: descartado — só precisamos comparar; HMAC basta e não é reversível.
- **Confiar no conteúdo do aviso**: descartado — o Bling repete e não garante ordem; reler é barato.
- **Amazon pelo Bling**: fora do escopo (decisão do dono); a Amazon usa voucher.

## Consequências

- Positivas: o comprador do marketplace entra sozinho; cancelamento tira o acesso daquele pedido; nenhum
  CPF em claro no banco, recibo ou trilha; mesma fila, mesma tela de eventos.
- Negativas: depende do `numeroDocumento` vir no pedido; o DONO precisa criar o app no Bling e
  autorizar; sem renovação por 30 dias (worker parado) a conexão pede "Reautorizar".
- Riscos: brute force do CPF de um pedido conhecido é limitado pelo teto (5 tentativas / 15 min por
  pedido); vazamento do `BETTER_AUTH_SECRET` permite testar CPFs contra os HMACs (como já vale para as
  demais cifras da plataforma).
