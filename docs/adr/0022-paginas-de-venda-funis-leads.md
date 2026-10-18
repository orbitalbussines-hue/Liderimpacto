# ADR-0022: Páginas de venda por blocos, funis com conversão por etapa e leads em tabela própria

- **Status**: Aceito
- **Data**: 2026-10-18
- **Decisores**: Paulo (Bah! Tech), dono do produto

## Contexto

O menu Marketing tinha "Páginas" e "Funis" como "Em breve". O criador precisa de página de venda do curso
e de captura de e-mail no endereço da própria área, ligada às ofertas da Fase 2 (ADR-0019), e de um funil
(captura → vendas → obrigado) com a conversão de cada etapa. A plataforma está em produção: nada de HTML
livre do criador (XSS na área de membros = sessão do aluno exposta), nada de rastreador de terceiros, e
os leads precisam de consentimento LGPD explícito. Migração `0016_paginas_funis_leads`, **só aditiva**
(5 tabelas, gerada depois da `0015` das integrações).

## Decisão

1. **Blocos prontos, não editor livre.** A página é um JSON validado por `configPaginaSchema`
   (`src/lib/paginas/config.ts`, `strictObject` + `discriminatedUnion`): capa, benefícios, módulos do
   curso, autor, depoimentos, preço, garantia, perguntas, chamada final e formulário de captura; cada um
   com SÓ os seus campos de texto. O render (`src/components/paginas/blocos.tsx`) é React puro: o texto
   sai escapado, sem `dangerouslySetInnerHTML`. Link de botão só `https://` completo (regex que barra
   `javascript:`, aspas e espaço) ou âncora interna (`#preco`, `#formulario`). Vídeo só **YouTube ou
   Vimeo pelo id** (`idDoVideo` extrai o id do link colado; o player sai de domínio fixo —
   `youtube-nocookie.com`, `player.vimeo.com` com `dnt=1`), nunca iframe com `src` do criador. O vídeo
   próprio da plataforma fica de fora: ele é HLS cifrado com token por matrícula (ADR-0005) e não tem
   reprodução pública. Imagens pelo storage existente (finalidade `IMAGEM`, conferida na action).
2. **Rascunho e publicada na mesma linha.** `criadores_paginas.rascunho` (autosave com trava por
   `updated_at`, o mesmo `useRascunho` do construtor, agora genérico) e `publicada` (cópia no "Publicar",
   `publicacoes` = número da versão). `/p/<slug>` lê só a publicada; "tirar do ar" volta a `RASCUNHO`
   sem apagar a publicada. Mais simples que a tabela de versões da vitrine (ADR-0010): a trilha guarda o
   JSON de cada publicação em `dados_novos`, que já é o histórico imutável. Publicar exige oferta no bloco
   Preço e curso no bloco Módulos visíveis; toda referência (imagem, curso, oferta, tag) é conferida como
   DESTE criador a cada gravação.
3. **Endereço `/p/<slug>` na área**, slug único entre as vivas do criador (índice parcial; excluir libera).
   O proxy ganhou `p` em `PUBLICAS` (só tira o redirect para o login; a página continua decidindo pelo
   host). Tema claro/escuro escolhido NA página (`data-theme` no contêiner, independente do tema de quem
   visita) com a cor da marca (`EstiloMarca`, escopo `data-area="aluno"`). SEO: título, descrição,
   canônica, Open Graph e `noindex` opcional; a imagem de compartilhamento vai por `/p/<slug>/imagem`, um
   link ESTÁVEL que redireciona para a URL assinada (que vence em 1–2 h e não serve ao robô da rede social).
   Domínio próprio fica para depois.
4. **Leads em tabela própria (`criadores_leads`), não como ALUNO sem curso.** Criar conta + vínculo ALUNO
   a partir de um formulário anônimo daria a qualquer pessoa que digitar um e-mail alheio uma conta na
   plataforma e acesso à área do aluno (vitrine, canais e eventos "TODOS", gamificação) — e conta exige
   regras de senha e de link (RN-102) que não cabem numa captura. Lead = nome, e-mail (minúsculo, um vivo
   por criador; nova captura atualiza nome, consentimento e data e soma `capturas`), página e funil da
   primeira captura, UTM (5 chaves, validadas), tag opcional (FK composta para `criadores_tags`) e o
   **texto exato do consentimento + data**, ambos vindos da versão PUBLICADA (nunca do corpo).
   Descadastro (RN-227) é respeitado pela mesma lista HMAC das campanhas: a lista de leads mostra quem saiu.
5. **Campanhas para leads ficam para depois** (de propósito). A fila de envios da Fase 3 é por MEMBRO
   (`criadores_emails_envios.membro_id` NOT NULL com FK composta) e o público é uma regra única sobre
   `criadores_membros` (ADR-0020 item 7). Levar leads a ela exige tornar o envio polimórfico (membro OU
   lead), mexer em `envio.ts`, `campanhas.ts`, `consultas.ts` e na tela de público — mudança no núcleo do
   envio em produção que merece a própria decisão. Hoje o lead que compra vira membro pelo fluxo da
   Fase 2 e entra nas campanhas por ali.
6. **Defesas da captura sem CAPTCHA de terceiro**: honeypot (`site`, escondido de pessoas e de leitor de
   tela; preenchido = responde "ok" e não grava), teto por IP no banco (10 em 10 min, `estourouTeto`) e
   consentimento obrigatório. A trilha registra a captura sem o e-mail.
7. **Métricas sem cookie.** Visita = beacon `POST /api/paginas/visita` ao abrir a página (prefetch e robô
   sem JS não contam), contador por (página, funil, dia de Brasília) com `UNIQUE NULLS NOT DISTINCT`
   (um upsert), teto de 60 por IP em 10 min; o IP só vira chave do teto, nada de IP ou identificador na
   tabela. Funil vem na URL (`?funil=<id>`, válido só se o funil é do criador e tem a página). O
   formulário em funil leva à próxima etapa publicada repassando funil, cupom, afiliado e UTM.
8. **Venda atribuída sem mexer no fluxo do Stripe.** O botão do Preço abre o link de compra da Fase 2 com
   `pagina=` e `funil=`; `rota-compra.ts` só passou a chamar `registrarCheckoutDaPagina(criador, vendaId,
   pagina, funil)` depois de criar o Checkout (nunca lança; página de outro criador ou fora do ar =
   ignorada). Clique = linha em `criadores_paginas_checkouts`; venda atribuída = a venda daquele clique
   ficou `PAGA` (receita = valor − reembolso). Webhook, worker e metadata do Stripe não mudaram.

## Alternativas Consideradas

- **Editor livre (HTML/arrastar e soltar)**: XSS e páginas quebradas no celular; os blocos cobrem a
  página de curso e a de captura, que é o pedido.
- **Lead como ALUNO sem curso + tag**: entra nas campanhas sem mudar nada, mas cria conta e acesso à área
  para qualquer e-mail digitado por terceiros (ver item 4).
- **Contar visita no render do servidor**: conta prefetch, robô e a prévia; o beacon é uma chamada leve.
- **Cookie/fingerprint para visitante único**: exigiria banner de consentimento; a contagem por abertura
  é suficiente para a conversão entre etapas.
- **`funil` na metadata do Checkout do Stripe**: mexeria em `checkout.ts` e no webhook; a venda já tem
  id próprio no clique.

## Consequências

### Positivas
- Página publicada é só texto escapado e mídia de origem fixa; não há caminho para script do criador.
- O criador vê, por etapa, visitas → leads → cliques → vendas pagas, sem rastreador de terceiros.
- Nada do fluxo de pagamento mudou além de uma chamada que não lança.

### Negativas / Trade-offs
- Visitas são aberturas (recarregar conta de novo), não pessoas únicas.
- Mudar o endereço vale na hora, também para a página no ar (o editor avisa).
- Leads ainda não recebem campanha (item 5); a captura grava e respeita o descadastro, mas o envio vem depois.
- Imagem assinada muda de URL a cada hora (o cache do otimizador acompanha a janela, como nas capas).

### Fica para depois
- Público "leads" nas campanhas e automações (envio polimórfico), exportação CSV de leads.
- Domínio próprio da página; vídeo da plataforma com reprodução pública; teste A/B; página de obrigado
  com upsell de um clique.
