# Especificação do sistema · Líder de Impacto

Documento para o Claude Code: o que construir, com que dados e em que ordem. O visual está em `../README.md` e nos HTMLs de referência.

## 1. Produto
Plataforma de cursos (área de membros) da Líder de Impacto / Valmer Albuquerque. Vende e entrega formações em vídeo, trilhas, mentorias ao vivo gravadas, avaliações, comunidade e certificados. A equipe administra tudo num painel; o aluno consome numa vitrine estilo streaming. Multi-turma (grupos de acesso) e preparada para múltiplos produtos.

Perfis: **Aluno**, **Admin** (equipe, com papéis), **Dono** (Valmer, acesso total e financeiro).

## 2. Stack sugerida (ajustar ao que já existir)
- Next.js (App Router) + TypeScript + Tailwind (tokens do README como CSS variables) + shadcn/ui ou Radix para primitivas.
- Banco: PostgreSQL + Prisma (ou Drizzle). Auth: Better Auth / Auth.js (e-mail+senha, magic link, recuperação). 
- Vídeo: Mux ou Bunny Stream / Cloudflare Stream (HLS, DRM leve, progresso, legendas). Arquivos: S3/R2.
- Pagamentos: webhooks Hotmart/Eduzz/Stripe/Pagar.me (matrícula automática na compra).
- E-mail: Resend/Postmark. Jobs: fila (Inngest/BullMQ) para e-mails, certificados, automações.
- Drag-and-drop: dnd-kit (construtor). Gráficos: Recharts. Ícones: lucide-react.
- Tempo real opcional: comunidade (SSE/WebSocket) e notificações.

## 3. Módulos e escopo por fase

### Fase 1 · MVP (vender e entregar aula)
1. Auth (login, primeiro acesso/criar senha, recuperar senha, sessão, tema).
2. Catálogo: Produto > Módulo > Aula (vídeo, descrição, materiais). Capas e imagens.
3. Matrículas e grupos de acesso (manual, por importação CSV e por webhook de compra).
4. Área do aluno: Home/vitrine, Continuar assistindo, Curso, Player com progresso, Perfil.
5. Admin: Home (KPIs básicos), Conteúdos, Membros, Matrículas, Importação.
6. Responsivo completo.

### Fase 2 · Engajamento
7. Avaliações/quizzes (banco de questões, nota mínima, tentativas, correção) e liberação por aprovação.
8. Certificados (modelos, emissão automática ao concluir, PDF, verificação por código/QR).
9. Trilhas (sequência de itens com pré-requisito).
10. Comunidade (canais, posts, comentários, curtidas, fixados, moderação) + notificações.
11. Gamificação (pontos, ranking, desafios).
12. **Construtor da vitrine e do player** (ver seção 6).

### Fase 3 · Crescimento
13. Financeiro (vendas, assinaturas, afiliados, cupons, ofertas) e integrações.
14. Marketing: páginas, funis, automações, campanhas de e-mail, eventos/auditoria.
15. Analytics (eventos, sessões, retenção, conclusão por aula).
16. IA: assistente do professor e base de conhecimento (RAG sobre as aulas). App mobile.

## 4. Modelo de dados (resumo)
```
User(id, nome, email, senhaHash, whatsapp, empresaCargo, avatarUrl, tema, papel[ALUNO|ADMIN|DONO], status, ultimoAcessoEm, criadoEm)
Group(id, nome, tipo)                           -- grupos de acesso/turmas
GroupMember(groupId, userId)
Product(id, codigo, titulo, slug, descricao, tipo[CURSO|MENTORIA|EVENTO], capa3x4, capa16x9, status[RASCUNHO|PUBLICADO|NAO_LISTADO], professorId, criadoEm, atualizadoEm)
Module(id, productId, ordem, titulo, status)
Lesson(id, moduleId, ordem, titulo, descricao, videoId, duracaoSeg, thumbUrl, capitulos[json], liberaEm, preRequisitoLessonId?)
Material(id, lessonId, nome, url, tipo[PDF|DOC|LINK])
Enrollment(id, userId, productId, origem[MANUAL|COMPRA|IMPORT], status[ATIVA|PENDENTE|CANCELADA], iniciadaEm, concluidaEm, expiraEm?)
LessonProgress(userId, lessonId, segundosAssistidos, concluida, ultimaPosicaoSeg, atualizadoEm)
Favorite(userId, productId|lessonId)  Note(userId, lessonId, tempoSeg, texto)
Trail(id, titulo, descricao, tag) TrailItem(trailId, ordem, tipo, refId, preRequisito)
Assessment(id, productId, moduleId?, titulo, tipo[QUIZ|PROVA|SIMULADO|FORMULARIO], notaMinima, tentativas, tempoMin, status)
Question(id, assessmentId, enunciado, tipo, opcoes[json], gabarito, peso)
Attempt(id, userId, assessmentId, nota, respostas[json], iniciadaEm, finalizadaEm)
CertificateTemplate(id, productId, titulo, layout[json], codigo) Certificate(id, userId, templateId, codigoVerificacao, emitidoEm, pdfUrl)
Channel(id, nome, acessoGroupId?) Post(id, channelId, authorId, lessonId?, texto, anexos, fixado, criadoEm)
Comment(id, postId|lessonId, authorId, texto, criadoEm) Like(userId, alvoTipo, alvoId)
Points(userId, total) PointEvent(userId, tipo, valor, criadoEm) Challenge(id, titulo, periodo, regra[json])
Notification(id, userId, tipo, payload, lidaEm)
Order(id, userId, productId, valor, gateway, status, criadoEm) Subscription(...) Coupon(...) Affiliate(...)
Automation(id, gatilho, acoes[json], status) Campaign(id, assunto, lista, enviadoEm, metricas)
AuditLog(id, actorId, acao, entidade, entidadeId, criadoEm)
AnalyticsEvent(id, userId, tipo, payload, criadoEm)

-- Construtor da vitrine
StorefrontConfig(id, status[RASCUNHO|PUBLICADO], versao, publicadoEm, publicadoPor,
                 hero{ imagemUrl, badge, titulo, descricao, botaoPrincipal{texto, acao, refId}, botaoSecundario{texto, acao, refId}, mostrarAvisos },
                 playerConfig{ abas{descricao,materiais,comentarios,anotacoes}, playlist, autoplay, velocidade, marcadores, avisoCertificado })
StorefrontRow(id, configId, ordem, titulo, tipo[CONTINUAR|TOP10|NOVIDADES|TRILHAS|MENTORIAS|LISTA|MANUAL],
              quantidade[3|5|7|10], ordenacao[MANUAL|RECENTES|MAIS_ASSISTIDOS], audiencia{ todos | groupIds[] }, visivel, itensManuais[refs])
```

## 5. API / rotas principais
Aluno: `GET /api/storefront` (config publicada já resolvida para o aluno: hero + fileiras com itens e progresso) · `GET /api/products/:slug` · `GET /api/lessons/:id` · `POST /api/lessons/:id/progress` · `POST /api/lessons/:id/complete` · `GET /api/trails` · `GET/POST /api/assessments/:id/attempts` · `GET /api/certificates` · `GET/POST /api/community/posts` · `GET/PATCH /api/me`.
Admin (papel ADMIN/DONO): CRUD de products/modules/lessons/materials, `/admin/members`, `/admin/enrollments`, `/admin/assessments`, `/admin/certificates`, `/admin/analytics`, **`/admin/storefront`** (GET rascunho, PUT rascunho, POST `/publish`, POST `/revert`).
Webhooks: `POST /webhooks/:gateway` cria usuário + matrícula + e-mail de primeiro acesso, idempotente.
Rotas de páginas: `/login`, `/` (vitrine), `/continuar`, `/cursos/[slug]`, `/aula/[id]`, `/avaliacoes`, `/trilhas`, `/comunidade`, `/certificados`, `/perfil`, `/admin/*` (espelha a sidebar do README).

## 6. Construtor da vitrine: regras
- Admin edita um **rascunho**; "Publicar" copia para a versão publicada (guardar histórico e permitir reverter). Indicador "Alterações não publicadas".
- Fileiras reordenáveis por drag-and-drop (dnd-kit), com ocultar/remover/duplicar. Cada fileira resolve seus itens no servidor conforme tipo, quantidade, ordenação e audiência:
  - CONTINUAR: lições com progresso 1-94% do aluno, mais recentes primeiro (não aparece se vazia).
  - TOP10: aulas mais assistidas nos últimos 7 dias (cache diário), com ranking 1..N.
  - NOVIDADES: itens criados/publicados nos últimos 30 dias, selo "Novo".
  - TRILHAS / MENTORIAS: respectivos produtos; LISTA: favoritos do aluno; MANUAL: itens escolhidos pelo admin.
- Fileira sem itens não é exibida. Audiência filtra por grupos do aluno.
- Prévia no construtor usa os mesmos componentes da vitrine real (desktop/mobile).
- Aba do Player grava `playerConfig` e o player lê essas flags.

## 7. Permissões
- ALUNO: só conteúdo das próprias matrículas ativas e dentro da liberação/pré-requisito. Comunidade conforme canais.
- ADMIN: gerencia conteúdo, membros, comunidade e vitrine. Sem financeiro/configurações críticas, salvo permissão.
- DONO: tudo, incluindo financeiro, equipe, domínios e integrações.
- Toda ação administrativa gera `AuditLog`. Proteger vídeo com URLs assinadas e expiração; rate limit em login; 2FA opcional para admin.

## 8. Requisitos não funcionais
- Responsivo (desktop e mobile), acessível (contraste AA, foco visível, navegação por teclado nas fileiras e player).
- Performance: imagens com lazy-load e tamanhos corretos, vitrine com cache por aluno (curto), vídeo adaptativo.
- LGPD: consentimento, exportação/exclusão de dados, termos de uso (aba em Eventos/Auditoria).
- i18n: pt-BR (padrão). Fuso America/Sao_Paulo.

## 9. Ordem sugerida de implementação
1. Setup (Next, Prisma, Tailwind com tokens, tema escuro/claro, fontes, ícones, layout shell do aluno e do admin).
2. Auth + usuários + grupos.
3. Catálogo (produto/módulo/aula) no admin + upload de vídeo.
4. Matrículas (manual/CSV/webhook) + e-mail de primeiro acesso.
5. Vitrine do aluno (estática, depois ligada ao construtor), página do curso, player com progresso.
6. Admin: dashboard, membros, matrículas.
7. Avaliações, certificados, trilhas.
8. Comunidade e notificações.
9. Construtor da vitrine/player (rascunho/publicar).
10. Financeiro, marketing, analytics, IA.

## 10. Prompt inicial sugerido para o Claude Code
> Leia `README.md`, `docs/SISTEMA.md` `docs/ARQUITETURA.md` e `docs/ARQUITETURA_VPS.md` desta pasta e abra `reference/Sistema de Aulas Lider de Impacto v3.dc.html` no navegador para ver o design. Os HTMLs são apenas referência visual: recrie tudo em Next.js + TypeScript + Tailwind + Prisma/PostgreSQL, usando os tokens do README como CSS variables (temas dark/light), lucide-react para ícones e as fontes Plus Jakarta Sans e Newsreader. Comece pela Fase 1, na ordem da seção 9, entregando um passo por vez com testes. Siga a abstração VideoProvider e as regras de player/progresso de ARQUITETURA.md. Antes de começar, liste dúvidas sobre stack, hospedagem de vídeo (seção 2 e 11 de ARQUITETURA.md) e gateway de pagamento.

## 11. Pendências do cliente
Logo oficial; capas (3:4 e 16:9) e thumbnails; foto do professor; textos reais de cursos/aulas; gateway de pagamento e hospedagem de vídeo; domínio; política de certificados e nota mínima; lista de grupos/turmas; regras de pontuação.
