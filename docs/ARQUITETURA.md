# Arquitetura recomendada · Líder de Impacto

Complementa `SISTEMA.md` (escopo e dados) e `../README.md` (visual). Valores de preço vêm de pesquisa de out/2026 e **mudam**: conferir nas páginas dos provedores antes de contratar.

## 1. Princípios
1. **Vídeo fora da aplicação.** O servidor nunca entrega vídeo; só emite links assinados e curtos. A aplicação fica leve e escala por conta do CDN do provedor.
2. **Monólito modular.** Um app Next.js + Postgres bem organizado em módulos (auth, catálogo, matrículas, progresso, avaliações, comunidade, vitrine, financeiro). Não começar com microsserviços.
3. **Gerenciado antes de self-hosted.** Banco, fila, e-mail, vídeo e storage como serviços. Self-host de vídeo só acima de ~1 milhão de horas/mês (pesquisa: abaixo disso o custo de engenharia supera a economia).
4. **Progresso é o dado mais quente.** Heartbeats do player são gravados em lote e com upsert, nunca um INSERT por segundo.
5. **Tudo auditável e reversível:** vitrine com rascunho/publicado, logs de admin, webhooks idempotentes.

## 2. Decisão de vídeo (a mais importante)
Resumo da pesquisa:
- **Assinatura de URL + restrição de domínio** é o mínimo para curso pago e atende a maioria. **DRM multi-DRM (Widevine + FairPlay)** só quando o risco de pirataria justifica. **Marca d'água dinâmica** (e-mail/CPF do aluno sobre o vídeo) inibe compartilhamento de gravações e é barata.
- **Vimeo e Wistia** protegem a página, não o stream (sem DRM nos planos self-serve). Não usar para conteúdo pago de valor.
- **Mux**: melhor DX, analytics de qualidade de reprodução incluídos, DRM, 100 mil minutos entregues grátis/mês; entrega em torno de US$ 0,001/min (≈ US$ 0,96 por 1.000 min), armazenamento ≈ US$ 0,003/min/mês, encoding barato/grátis conforme fonte.
- **Cloudflare Stream**: preço simples (≈ US$ 5 por 1.000 min armazenados + US$ 1 por 1.000 min entregues), URLs assinadas, **sem DRM completo**, analytics básico.
- **Bunny Stream**: o mais barato (cobra por GB; ~US$ 0,005–0,01/GB), CDN integrado, token auth; DRM (MediaCage) opcional cobrado por licença; analytics mais simples.
- **VdoCipher / Gumlet / Kinescope**: especialistas em DRM + marca d'água dinâmica + URLs assinadas para cursos; planos a partir de ~US$ 99/mês (Gumlet com DRM) ou ~US$ 149/ano (VdoCipher) segundo a pesquisa.

**Recomendação para este projeto** (cursos executivos e mentorias, preço médio/alto, público corporativo):
- **Padrão (começar):** Bunny Stream **ou** Mux, com URLs assinadas expiráveis (5–10 min), restrição de domínio, bloqueio de download, **marca d'água dinâmica no player** (nome + e-mail do aluno, discreta e em posição variável) e limite de sessões simultâneas por aluno.
- **Se pirataria virar problema:** ativar DRM (Bunny MediaCage ou migrar para Mux/Kinescope/VdoCipher).
- Se a prioridade for **analytics de reprodução** (onde o aluno trava, buffering, abandono por aula): Mux.
- **Abstração obrigatória:** criar uma interface `VideoProvider { createUpload(), getPlaybackToken(lessonId, userId), onWebhook(), getStatus() }` para trocar de provedor sem reescrever o app. Guardar `videoProvider` e `videoId` na `Lesson`.
- Fluxo de upload do admin: upload direto do navegador ao provedor (URL de upload pré-assinada) → webhook `video.ready` → atualiza duração, thumbnail e status da aula. Legendas (VTT) e capítulos editáveis no admin.
- Ao vivo (mentorias): usar Zoom/Meet e subir a gravação como aula; live nativa só na fase 3.

## 3. Player (o que construir)
- Base: **Mux Player** (se Mux) ou **Vidstack / hls.js** (qualquer HLS), envolvido num componente próprio com o visual do design (barra de progresso com marcadores de capítulo, velocidade 0.5–2x, legendas, qualidade, tela cheia, teclado: espaço, J/K/L, setas, F, M, 0–9).
- **Retomar de onde parou:** ao abrir a aula, buscar `ultimaPosicaoSeg`.
- **Progresso (heartbeat):** enviar a cada 10 s enquanto reproduz + em pause/seek/fim/`visibilitychange`/`beforeunload` (`navigator.sendBeacon`). Servidor faz upsert em `LessonProgress` (só avança o máximo assistido; ignora saltos para marcar conclusão). Conclusão = ≥ 90% do vídeo **assistido** (somar intervalos únicos) ou botão "Concluir e avançar" quando a regra do produto permitir.
- **Autoplay da próxima aula** com contagem de 5 s (configurável no construtor).
- **Anotações com timestamp**, favoritos, comentários por aula e materiais.
- **Anti-compartilhamento:** token de playback atrelado ao usuário, expiração curta, limite de 2 sessões simultâneas, marca d'água dinâmica, bloqueio de domínio, detecção de padrão anormal (muitos IPs/dispositivos) com alerta ao admin.
- **Acessibilidade:** legendas, foco visível, atalhos, contraste AA, respeita `prefers-reduced-motion`.
- **Mobile:** fullscreen nativo, orientação, 44px de alvos, picture-in-picture quando suportado, continuar em outro dispositivo (progresso no servidor).

## 4. Infraestrutura sugerida
| Camada | Recomendação | Observação |
|---|---|---|
| App web/API | Next.js (App Router) + TypeScript em Vercel ou Fly.io/Railway | Edge cache nas páginas públicas; ISR/cache curto na vitrine |
| Banco | PostgreSQL gerenciado (Neon, Supabase ou RDS) + pooler (PgBouncer) | Backups diários + PITR; réplica de leitura quando o analytics crescer |
| Cache / filas | Redis (Upstash) para cache, rate limit e contadores; fila com Inngest/BullMQ | Top 10 e totais calculados por job, não por request |
| Vídeo | Provedor da seção 2 | Webhooks → fila |
| Arquivos | S3 / Cloudflare R2 (PDFs, imagens, certificados) | URLs assinadas; imagens via CDN com redimensionamento (next/image ou Cloudflare Images) |
| Auth | Better Auth ou Auth.js | Senha com Argon2, sessão em cookie httpOnly, 2FA opcional para admin |
| E-mail | Resend ou Postmark | Domínio com SPF/DKIM/DMARC; templates versionados |
| Pagamentos | Webhooks Hotmart/Eduzz/Stripe/Pagar.me | Idempotência por `gateway + eventId` |
| Observabilidade | Sentry (erros), PostHog (produto/analytics), logs estruturados, uptime check | Alertas: falha de webhook, fila parada, erro de playback |
| CI/CD | GitHub Actions: lint, tipos, testes, migração, preview por PR | Ambientes: dev, staging, produção |

## 5. Capacidade e desempenho
- **O que escala sozinho:** entrega de vídeo (CDN do provedor), imagens e arquivos.
- **O que precisa de cuidado:** heartbeat de progresso, vitrine por aluno, comunidade.
  - Heartbeat: 1 request por 10 s por aluno ativo. 1.000 alunos simultâneos ≈ 100 req/s de escrita leve. Usar upsert por `(userId, lessonId)`, índice único, e **debounce no cliente**; se passar disso, bufferizar em Redis e persistir em lote a cada 30–60 s.
  - Vitrine: `GET /api/storefront` combina config publicada (cache compartilhado) + dados do aluno (progresso, favoritos). Cachear a parte pública em CDN/Redis e resolver só o que é pessoal por aluno.
  - Top 10, totais do dashboard e ranking: pré-computar por job agendado (diário/horário).
- **Índices essenciais:** `LessonProgress(userId, lessonId)` único; `Enrollment(userId, productId)`; `Lesson(moduleId, ordem)`; `Post(channelId, criadoEm desc)`; `AnalyticsEvent(tipo, criadoEm)` particionada por mês; `Certificate(codigoVerificacao)` único.
- Metas iniciais: LCP < 2,5 s na vitrine; início do vídeo < 2 s; API p95 < 300 ms; disponibilidade 99,9%.
- **Teste de carga** (k6) antes do lançamento: 1.000 alunos simultâneos assistindo + 200 abrindo a vitrine.

## 6. Estimativa de custo de vídeo (ordem de grandeza)
Premissa de exemplo: 500 alunos ativos × 10 h assistidas/mês = **300.000 min entregues/mês**, 40 h de conteúdo armazenado (2.400 min).
- Mux: ≈ (300.000 − 100.000 grátis) × US$ 0,00096 ≈ **US$ 190/mês** + armazenamento ≈ US$ 7.
- Cloudflare Stream: 300.000 × US$ 0,001 ≈ **US$ 300/mês** + armazenamento ≈ US$ 12.
- Bunny Stream: depende do bitrate; geralmente a opção mais barata por GB entregue. **Medir com piloto**.
- DRM: adicional (licença por reprodução no Bunny; incluso/add-on nos especialistas).
Conferir tabelas atuais antes de decidir; o custo cresce linearmente com horas assistidas, então medir por aluno ativo.

## 7. Segurança e conformidade
- Autorização em toda rota: aluno só acessa produto com matrícula ativa e aula liberada; checagem no servidor (nunca só no front).
- Rate limit em login, recuperação de senha, comentários e webhooks; proteção contra enumeração de e-mails.
- Cabeçalhos de segurança (CSP, HSTS), CSRF, sanitização de HTML (comunidade/descrições), upload com validação de tipo e tamanho e varredura.
- LGPD: base legal e consentimento, exportar/excluir dados do aluno, retenção de logs, DPO/contato, política de privacidade e termos (versão aceita registrada).
- Segredos em variáveis de ambiente do provedor; rotação de chaves; princípio do menor privilégio.
- Backups testados (restauração real, não só backup).

## 8. Estrutura de pastas sugerida
```
/app
  (aluno)/            page.tsx (vitrine), continuar, cursos/[slug], aula/[id], avaliacoes, trilhas, comunidade, certificados, perfil
  (auth)/login, primeiro-acesso, recuperar
  admin/              dashboard, conteudos, construtor, membros, matriculas, avaliacoes, certificados, comunidade, estudio, financeiro, marketing, analytics, config
  api/                storefront, lessons/[id]/progress, playback-token, webhooks/[gateway]
/modules              auth, catalog, enrollment, progress, assessment, community, storefront, billing, notifications
/lib                  video/ (VideoProvider + adapters), email/, payments/, storage/, flags.ts
/components           ui/ (primitivas com os tokens), player/, vitrine/ (Hero, Row, Card, RankCard), admin/ (Table, Sidebar, Builder)
/prisma               schema.prisma, migrations, seed.ts
/tests                unit, integration, e2e (Playwright)
```

## 9. Testes e qualidade
- Unitários: regra de conclusão de aula, liberação por pré-requisito, resolução das fileiras da vitrine, cálculo de nota.
- Integração: webhooks idempotentes (compra → usuário → matrícula → e-mail), progresso, publicação do construtor.
- E2E (Playwright): login → vitrine → player → concluir aula → certificado; admin cria aula e publica vitrine; mobile viewport.
- Acessibilidade automatizada (axe) nas telas principais.
- Seeds com dados de exemplo (os mesmos nomes do protótipo).

## 10. Plano de entrega (resumo)
1. **Fundação (1–2 sem):** repo, CI, banco, auth, tokens/tema, shells aluno/admin.
2. **Conteúdo e vídeo (2–3 sem):** catálogo, upload, webhook de vídeo, player com progresso e retomada.
3. **Acesso (1–2 sem):** matrículas manual/CSV/webhook, primeiro acesso por e-mail, grupos.
4. **Experiência do aluno (2 sem):** vitrine, continuar assistindo, curso, perfil, mobile.
5. **Admin essencial (2 sem):** dashboard, conteúdos, membros, matrículas.
6. **Engajamento (3–4 sem):** avaliações, certificados, trilhas, comunidade, notificações.
7. **Construtor (1–2 sem):** rascunho/publicar, fileiras, player config.
8. **Crescimento (contínuo):** financeiro, marketing, analytics, IA, app.
Estimativas indicativas para 1–2 devs com Claude Code; ajustar após o piloto.

## 11. Decisões em aberto (precisam de resposta do Valmer)
Provedor de vídeo e nível de proteção (DRM sim/não); gateway de pagamento; volume esperado (alunos ativos, horas/mês) para dimensionar custo; domínio e marca; regras de certificado e nota mínima; política de reembolso e expiração de acesso; necessidade de app nativo; idioma único (pt-BR).

## Fontes consultadas (pesquisa out/2026)
- mux.com/articles/the-best-video-apis-right-now
- apiscout.dev/guides/mux-vs-cloudflare-stream-api-2026
- leanopstech.com/blog/mux-vs-cloudflare-stream-vs-cloudfront-2026
- blog.blazingcdn.com (Cloudflare Stream pricing 2026)
- gumlet.com/learn (DRM e hospedagem de vídeo para cursos)
- kinescope.com/blog/best-video-hosting-online-courses
- vdocipher.com/blog/best-video-hosting-for-online-courses
- swarmify.com/blog/video-hosting-for-online-courses
