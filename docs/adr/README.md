# Architecture Decision Records (ADR)

Registro das decisoes de arquitetura do projeto. Cada decisao significativa
(escolha de tecnologia, padrao estrutural, trade-off relevante) vira um ADR
numerado e imutavel — se a decisao muda, cria-se um novo ADR que supersede o anterior.

## Por que

- Novos devs (e a IA) entendem **por que** o codigo e do jeito que e.
- Evita rediscutir decisoes ja fechadas.
- Da contexto historico para mudancas futuras.

## Como criar

1. Copie `0000-template.md` para `NNNN-titulo-curto.md` (proximo numero).
2. Preencha contexto, decisao, consequencias.
3. Status inicial: `Proposto`. Apos aprovado: `Aceito`.
4. Se uma decisao nova substitui esta, marque como `Substituido por ADR-XXXX`.

## Indice

| ADR | Titulo | Status |
|-----|--------|--------|
| [0001](0001-stack-base.md) | Stack base: Next.js + Drizzle + PostgreSQL | Aceito |
| [0002](0002-plataforma-multi-criador.md) | Plataforma com vários criadores, Drizzle e cor em cascata | Aceito |
| [0003](0003-autenticacao-plataforma.md) | Autenticação: Better Auth, cookie por host, 2FA só do SUPER_ADMIN | Aceito |
| [0004](0004-armazenamento-e-catalogo.md) | Armazenamento S3 com envio direto e catálogo isolado por criador | Aceito |
| [0005](0005-video-self-host-entrega-pelo-app.md) | Vídeo self-host (HLS AES-128) com entrega protegida pelo app | Aceito |
| [0006](0006-progresso-bitmap-e-top10.md) | Progresso em bitmap por segundo, upsert de uma instrução e Top 10 por agregado diário | Aceito |
| [0007](0007-painel-dias-de-atividade-e-cache.md) | Painel do admin: dias de atividade por membro e agregados com cache curto | Aceito |
| [0008](0008-avaliacoes-certificados-trilhas.md) | Avaliações com gabarito separado, certificado com PDF versionado em fila própria e trilhas | Aceito |
| [0009](0009-comunidade-notificacoes.md) | Comunidade em texto puro, limite de frequência no banco e notificações por polling | Aceito |
| [0010](0010-construtor-da-vitrine.md) | Construtor da vitrine: rascunho único, versões imutáveis, prévia por iframe e cache por etiqueta | Aceito |
| [0011](0011-eventos-ao-vivo.md) | Eventos ao vivo: link só na janela, público por regra única e lembrete por job atrasado | Aceito |
| [0012](0012-gamificacao-razao-de-pontos.md) | Gamificação: razão de pontos append-only, tudo calculado, desafios por janela; segundos por dia no heartbeat | Aceito |
| [0013](0013-legendas-e-transcricao.md) | Legendas e transcrição: VTT normalizado no storage, texto puro no banco, entrega pelo app | Aceito |
| [0014](0014-assistente-ia-base-de-conhecimento.md) | Assistente do professor com Claude: busca full-text, recuperação filtrada pelo acesso e limites no banco | Aceito |
| [0015](0015-homologacao-em-uma-vps.md) | Homologação em 1 VPS: Docker Compose, Caddy com DNS-01 Cloudflare, SeaweedFS local, imagens no GHCR e backup no R2 | Aceito (referência para HML futura em VPS dedicada; hoje sem HML, 0017) |
| [0016](0016-homologacao-no-easypanel-compartilhado.md) | Homologação no Easypanel compartilhado com a página de vendas: serviços App, deploy por Trigger depois do CI, migração com trava e saúde por versão do schema | Aceito (o desenho vale para a PRD, 0017) |
| [0017](0017-producao-direto-sem-homologacao.md) | Produção direto, sem homologação: deploy da `master` no Easypanel, backup do banco no R2 antes de cada deploy e versão liberada só depois dele | Aceito |
| [0018](0018-fase1-tags-vouchers-feedback-webhooks-ia-estudio.md) | Fase 1 sem "Em breve": tags, vouchers, feedback útil/não útil, disparos de e-mail append-only com HMAC, webhooks assinados com bloqueio de SSRF, tentativas extras e IA no estúdio | Aceito |
| [0019](0019-fase2-pagamentos-stripe-connect.md) | Fase 2: pagamentos por Stripe Connect (direct charges, Checkout hospedado, taxa por criador em bps, webhook Connect com recibo append-only e releitura do evento) | Aceito |
| [0020](0020-fase3-campanhas-automacoes-email.md) | Fase 3: campanhas e automações de e-mail (provedor trocável atrás de interface, teto de envio por janela deslizante, fila por destinatário idempotente, clique assinado sem redirect aberto, descadastro por HMAC com RFC 8058, reenvio do primeiro acesso pela regra do link) | Aceito |
| [0021](0021-integracoes-hotmart-eduzz.md) | Integrações Hotmart e Eduzz: URL por conexão, hottok/HMAC em tempo constante com segredo cifrado, recibo append-only sem dado pessoal, fila e `matricular` com referência estável | Aceito |
| [0022](0022-paginas-de-venda-funis-leads.md) | Páginas de venda por blocos (texto escapado, link só https, vídeo só YouTube/Vimeo por id), rascunho/publicada com trava, funis com conversão por etapa (visita por beacon sem cookie, venda atribuída pelo link de compra) e leads em tabela própria com consentimento LGPD | Aceito |
