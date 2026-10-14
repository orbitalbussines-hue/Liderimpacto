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
