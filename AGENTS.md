# Líder de Impacto · Sistema de Aulas — instruções para agentes IA

> Codex, Cursor, Copilot, Gemini, Claude: leia este arquivo INTEIRO antes de qualquer
> tarefa. Ele é a fonte única das regras. `CLAUDE.md` só importa este arquivo.

## Contexto

Área de membros da Líder de Impacto (Valmer Albuquerque): vitrine de cursos em vídeo estilo streaming para o aluno e painel administrativo para a equipe. Não pode dar errado: aluno sem matrícula ativa acessar aula paga, progresso perdido e vídeo vazado. Handoff de design e escopo em `README.md`, `docs/SISTEMA.md`, `docs/ARQUITETURA.md` e `docs/ARQUITETURA_VPS.md`; `reference/` é só referência visual.

## Stack (fechada — não reabrir sem ADR)

- **Linguagem**: TypeScript strict
- **Framework**: Next.js (App Router, Server Components, Server Actions). Sem API separada.
  O `proxy.ts`/`middleware.ts` **não é fronteira de segurança**: página, action e handler
  conferem sessão por conta própria.
- **ORM**: Drizzle ORM — NUNCA Prisma
- **Banco**: PostgreSQL 16 via Docker, igual em dev, teste e produção — NUNCA SQLite
- **Validação**: Zod (`strictObject`) + regex nos formatos críticos
- **UI**: Tailwind v4 + design system próprio em `src/components/ui` (tokens do `README.md`, temas escuro/claro, lucide-react, Plus Jakarta Sans + Newsreader). shadcn/Radix só como base acessível de primitivas. Tela nova = montar com os componentes e moldes de `docs/components.md`, nunca estilo solto
- **Testes**: Vitest + Testing Library
- **Princípios**: SOLID — alta coesão, baixo acoplamento, regra de negócio em um lugar só

Código, comentário, documentação, UI, mensagem de erro e commit em **PT-BR**.

## Ordem de leitura

1. Este arquivo, inteiro
2. `docs/PROJECT_MAP.md` — o que já existe (gerado por `npm run map`; não edite à mão)
3. `docs/regras-negocio.md` — regras do cliente
4. `docs/adr/` — decisões já tomadas e o porquê
5. O arquivo real que você vai alterar (sempre ler antes de editar)

## Regras absolutas

### Banco de dados
1. NUNCA SQLite, em nenhum ambiente. NUNCA Prisma.
2. NUNCA delete físico: `db.delete(`, `tx.delete(`, `.deleteMany(` e `DELETE FROM` reprovam
   no auditor e no pre-commit. Exclusão é `marcaDeExclusao()` (soft delete).
3. TODA tabela tem as 5 colunas de auditoria, sempre por `...colunasAuditoria`
   (`src/lib/db/schema/_compartilhado.ts`): `created_at`, `updated_at`, `deleted_at`,
   `is_deleted`, `modified_by`. Exceção só com marcador escrito e justificado:
   `compliance:append-only` (trilha de auditoria) ou `compliance:framework` (tabela que a
   lib de auth apaga sozinha).
4. NUNCA `timestamp()` cru: todo instante é `instante()` = `timestamptz(3)`. O
   microssegundo do Postgres nunca bate com o milissegundo do `Date` e a trava de colisão
   recusaria toda edição.
5. NUNCA `$onUpdate` em `updated_at` — quem grava `updated_at` é a action.
6. TODA FK com `{ onDelete: "restrict", onUpdate: "restrict" }` explícitos. Nunca cascade.
7. Dinheiro é `dinheiro()` (numeric em modo string). NUNCA `number` para valor monetário.
   Exceção única: valores do Stripe em CENTAVOS INTEIROS (`integer`, unidade mínima do gateway), ADR-0019.
8. Enum é `text` + `CHECK` com a lista em `schema/_enums.ts`. NUNCA `pgEnum`.
9. Nome de tabela hierárquico e em snake_case: `contratos` → `contratos_lancamentos` →
   `contratos_lancamentos_categorias`.
10. TODA leitura filtra `vivos(tabela)`. TODA edição e exclusão usa
    `travaDeColisao(tabela, id, updatedAtOriginal)` (optimistic locking).
11. Mudança de schema só por migração: `npm run db:generate` + revisar o SQL +
    `npm run db:migrate`. NUNCA `drizzle-kit push`. NUNCA dropar tabela ou banco.

### Código
12. Regra de negócio mora em UM lugar (`src/lib/actions/<entidade>.ts` ou
    `src/lib/<dominio>/`). A tela chama a action; não duplica lógica.
13. TODA Server Action é um POST alcançável direto: começa com `exigirMembro(papeis)` (negócio do
    criador; o criador vem do HOST, nunca do corpo), `exigirSuperAdmin()` (plataforma) ou
    `exigirSessao()` (conta), e valida TUDO com Zod, inclusive ids.
14. NUNCA espalhar o corpo da requisição na linha (`{ ...dados }`). Campo a campo.
    Papel, dono, preço e `modified_by` vêm do servidor.
15. Papel e `ativo` são lidos do BANCO a cada requisição — nunca do token.
16. Mutação + auditoria na MESMA transação (`registrarAuditoria(tx, ...)`).
17. Action que muta devolve `Resultado` via `executar()` — erro esperado vira mensagem.
    Em produção o Next esconde a mensagem de qualquer `throw`.
18. Ação crítica na tela (excluir, salvar lançamento financeiro) passa pelo
    `ModalConfirmacaoBlock`: 3 s travado, não fecha por ESC nem clique fora.
19. NUNCA `alert()`, NUNCA `any`, NUNCA erro cru do banco na tela.
20. NUNCA commitar segredo, `.env` ou senha literal — nem em seed, README ou docs.
    Variável nova vai documentada em `.env.example`.

### Estrutura
21. NUNCA criar arquivo na raiz. Use `src/`, `tests/`, `docs/`, `config/`, `scripts/`,
    `templates/`. (Configs que a ferramenta exige na raiz são a exceção.)
22. NUNCA arquivo com mais de 500 linhas — exceto `src/components/ui/` (shadcn vendorizado,
    não se edita).
23. NUNCA `node -e "..."` ou `psql -c "..."` inline no PowerShell com parêntese ou aspas: o
    shell cria na raiz arquivos com o nome do fragmento. Escreva um `.mjs` em `scripts/`.
    Limpeza: `npm run lixo` (simulação) e `node scripts/limpar-lixo-raiz.mjs --aplicar`.
24. NUNCA criar documentação sem pedido. MAS regra de negócio nova vai para
    `docs/regras-negocio.md` e decisão de arquitetura vira ADR em `docs/adr/`.
25. Quando mudar uma regra, mude no código, neste arquivo e no auditor juntos.

## Onde as coisas moram

| O quê | Onde |
| :--- | :--- |
| Conexão única com o banco | `src/lib/db/index.ts` (`db`, tipo `Transacao`) |
| Helpers de coluna | `src/lib/db/schema/_compartilhado.ts` (`instante`, `dinheiro`, `colunasAuditoria`) |
| Enums | `src/lib/db/schema/_enums.ts` (`PAPEIS_PLATAFORMA`, `PAPEIS_CRIADOR`, `listaSql`) |
| Tabelas | `src/lib/db/schema/<tabela>.ts`, reexportadas em `schema/index.ts` |
| Soft delete e trava | `src/lib/db/soft-delete.ts` (`vivos`, `travaDeColisao`, `marcaDeExclusao`) |
| Trilha de auditoria | `src/lib/audit/registrar.ts` + tabela `auditoria` (append-only) |
| Criador da requisição | `src/lib/criador/` (`criadorDoHost` puro, `criadorAtual()`/`hostAtual()` nas páginas) |
| Sessão | `src/lib/auth/sessao.ts` (`obterSessao`, `obterSessaoDeSeguranca`) — Better Auth, ADR-0003 |
| Permissão | `src/lib/auth/autorizacao.ts` (actions: `exigirSessao`, `exigirMembro`, `exigirSuperAdmin`), `guarda.ts` (páginas), matriz em `docs/rbac.md` |
| Resultado de action | `src/lib/acao.ts` (`executar`, `ErroDeNegocio`, `Resultado`) |
| Arquivos no storage S3 (envio direto, chave por criador) | `src/lib/armazenamento/` (`regras.ts` puro, `cliente.ts`, `arquivos.ts`) — ADR-0004 |
| Vídeo da aula (envio multipart, worker FFmpeg, HLS AES-128, token, chave) | `src/lib/video/` (`provedor-proprio.ts`, `entrega.ts`, `acesso.ts` = `podeAssistir`/`motivoDoBloqueio`, com pré-requisito), worker `npm run worker:video` — ADR-0005. O Next NUNCA roda FFmpeg nem serve bytes de vídeo |
| Legendas e transcrição (bruto pela finalidade `LEGENDA` → `.vtt` normalizado SEM tags + texto puro no banco; `GET /api/legendas/[id]` com `acessoDaAula`) | `src/lib/legendas/` (`regras.ts` puro = parser/sanitizador/busca, `servico.ts`, `consultas.ts`, `entrega.ts`); actions em `actions/legendas.ts`; player `components/player/use-legenda.ts` — ADR-0013, RN-180. Legenda é sempre exibida como TEXTO |
| Catálogo (produto > módulo > aula > material) | `src/lib/catalogo/` (consultas, regras, ordem, publicação) |
| Matrículas (serviço `matricular` = ponto de entrada do futuro webhook, idempotente) | `src/lib/matriculas/` (`servico.ts`, `consultas.ts`, `regras.ts`, `csv.ts`) — RN-116/117, `docs/back.md` |
| Progresso, fileiras, curso e player do aluno (batida = 1 UPSERT com bitmap por segundo; beacon `POST /api/progresso`; Top 10 por agregado diário + `"use cache"`) | `src/lib/progresso/` (`registrar.ts`, `batida.ts`, `beacon.ts`, `consultas.ts`, `consultas-curso.ts`, `top10.ts`, `regras.ts`) — ADR-0006, RN-118 a RN-121, API em `docs/back.md` |
| Painel (Home) do admin: KPIs, acessos 14 dias, mais assistidas, saúde, "acontecendo agora" (uma consulta por bloco; agregados com `"use cache"` de minutos; dias de atividade em `criadores_membros_atividades`) | `src/lib/painel/` (`consultas.ts`, `cache.ts`, `regras.ts`) — ADR-0007, RN-122 |
| Analytics do admin: KPIs com variação, séries diárias, conteúdo e abandono por aula, coortes, avaliações, CSV só agregado (`GET /admin/analytics/exportar`); horas assistidas por período (segundos novos por dia em `criadores_membros_atividades.segundos`; com curso, acumulado) | `src/lib/analytics/` (`consultas.ts`, `consultas-avaliacoes.ts`, `cache.ts`, `regras.ts`, `csv.ts`, `exportar.ts`) — RN-139, `docs/back.md` |
| Avaliações (questões com gabarito em coluna separada, tentativas com correção e prazo no servidor, liberação do módulo = motivo `AVALIACAO` em `motivoDoBloqueio`) | `src/lib/avaliacoes/` (`situacao.ts`, `tentativas.ts`, `consultas.ts`, `admin.ts`, `regras.ts`, `sql.ts`) — ADR-0008, RN-123 a RN-125 |
| Certificados (emissão automática idempotente, PDF versionado pdf-lib, fila `certificados`, worker `npm run worker:certificados`, verificação pública) | `src/lib/certificados/` (`emissao.ts`, `consultas.ts`, `pdf.ts` — só worker, `worker.ts`, `fila.ts`, `regras.ts`) — ADR-0008, RN-127 a RN-129 |
| Trilhas (etapas curso/avaliação com "exige a anterior", estados por item, fileira da vitrine) | `src/lib/trilhas/` (`consultas.ts`, `regras.ts`) — RN-126; API de todo o passo 7 em `docs/back.md` |
| Comunidade (canais por acesso, posts em texto puro, anexos pela allowlist, enquete, comentários de 1 nível em post ou aula, curtidas, moderação, limite de frequência no banco) | `src/lib/comunidade/` (`regras.ts` puro com `segmentosDeTexto`, `sql.ts` = `veCanalSql` única regra de quem vê, `canais.ts`, `publicacoes.ts`, `comentarios.ts`, `moderacao.ts`, `anexos.ts`, `consultas.ts`) — ADR-0009, RN-130 a RN-133. A tela NUNCA usa `dangerouslySetInnerHTML` |
| Notificações in-app (geradas depois do commit e sem derrubar a ação; agregação de curtidas; contador por índice parcial; polling `GET /api/notificacoes/contagem`) | `src/lib/notificacoes/` (`gerar.ts`, `consultas.ts`, `regras.ts` = texto e link de cada tipo, `rota.ts`) — ADR-0009, RN-134 |
| Eventos ao vivo (link só de 15 min antes até o fim, decidido no servidor; público TODOS/PRODUTO/GRUPOS numa regra só; presença; lembrete por job atrasado na fila `eventos`) | `src/lib/eventos/` (`regras.ts` puro, `sql.ts` = `vePublicoSql`/`veEventoSql`/`veDesafioSql`, `consultas.ts`, `presenca.ts`, `admin.ts` = leituras da equipe, `tela.ts` puro, `agenda-ics.ts` puro + `rota-agenda.ts`, `fila.ts` + `lembrete.ts` = lembrete no 2º Worker de `worker:certificados`); actions em `actions/eventos.ts`; avisos em `notificacoes/gerar.ts` — ADR-0011, RN-142, RN-143, RN-160 |
| Gamificação (razão de pontos append-only e idempotente, ranking/nível/progresso de desafio CALCULADOS, recálculo `npm run gamificacao:recalcular -- <slug>`) | `src/lib/gamificacao/` (`padroes.ts`, `regras.ts` puro, `pontos.ts` = `concederPontos`/`registrarConquista`/`ajustarPontos`, `ranking.ts`, `desafios.ts`, `recalcular.ts`, `admin.ts` = telas da equipe, `conquistas.ts` = tela do aluno); actions em `src/lib/actions/gamificacao.ts`; ganchos depois do commit em progresso, matrícula concluída, avaliação aprovada e publicação — ADR-0012, RN-144 a RN-147 |
| Base de conhecimento e assistente do professor (Claude; busca full-text em português sem acento, trechos com assinatura idempotente, fila `conhecimento` no 3º Worker de `worker:certificados`, recuperação filtrada pelo acesso ANTES do modelo, limite diário no banco, streaming NDJSON em `POST /api/assistente`, `npm run conhecimento:reindexar -- <slug>`) | `src/lib/conhecimento/` (`regras.ts` puro, `indexar.ts`, `fila.ts`, `pedir.ts`, `busca.ts` = `recuperarTrechos`, `consultas.ts`) e `src/lib/assistente/` (`regras.ts`/`texto.ts` puros, `cliente.ts` = `ClienteIA` + SDK, só servidor, `cliente-falso.ts` para testes, `responder.ts`, `rota.ts`, `conversas.ts`, `config.ts`, `tela.ts`, `admin.ts`); actions em `actions/conhecimento.ts` e `actions/assistente.ts` — ADR-0014, RN-190 a RN-197. Resposta exibida só como texto (nunca `dangerouslySetInnerHTML`); testes NUNCA chamam a API real |
| Fase 1 dos "Em breve": tags de membros, vouchers (resgate com voucher travado, `matricular` origem VOUCHER), feedback útil/não útil, disparos de e-mail (append-only, máscara + HMAC, gravado pelo `enviarEmail`), webhooks de saída (segredo cifrado, HMAC no cabeçalho, bloqueio de SSRF, fila `webhooks` no 4º Worker de `worker:certificados`, emissão depois do commit), abas de acompanhamento e IA no estúdio | `src/lib/tags/`, `src/lib/vouchers/`, `src/lib/feedbacks/`, `src/lib/email/disparos.ts`, `src/lib/webhooks/` (`regras.ts` puro, `rede.ts` = SSRF, `segredo.ts`, `emitir.ts`, `entrega.ts`, `fila.ts`, `servico.ts`, `consultas.ts`), `src/lib/matriculas/abas.ts`, `src/lib/progresso/continuar.ts`, `src/lib/video/estatisticas.ts`, `src/lib/estudio-ia/`; actions `tags.ts`, `vouchers.ts`, `feedbacks.ts`, `webhooks.ts` (só DONO), `estudio-ia.ts` — ADR-0018, RN-200 a RN-206, `docs/back.md` "Fase 1". Tabela append-only nova entra em `APPEND_ONLY` do `scripts/db-migrar.ts` |
| Fase 2 — pagamentos por Stripe Connect (direct charge com Checkout hospedado NA conta do criador, taxa da plataforma em bps por criador, centavos inteiros, cupons, afiliados com comissão calculada, assinaturas; webhook Connect com recibo append-only `stripe_eventos`, criador pela conta conectada e evento relido na API; fila `pagamentos` no 5º Worker de `worker:certificados`) | `src/lib/pagamentos/` (`regras.ts` puro, `stripe.ts` = `GatewayStripe` + SDK, só servidor, `stripe-falso.ts` para testes, `conta.ts`, `ofertas.ts`, `cupons.ts`, `afiliados.ts`, `checkout.ts`, `vendas.ts`, `acesso.ts`, `webhook.ts`, `fila.ts`, `processar.ts`, `rota-compra.ts`, `consultas.ts`); actions `pagamentos.ts`, `ofertas.ts`; rotas `/api/stripe/checkout` e `/api/stripe/webhook` — ADR-0019, RN-210 a RN-217, `docs/back.md` "Fase 2". Testes NUNCA chamam a API real |
| Fase 3 — campanhas e automações de e-mail (provedor `ProvedorEmail` trocável, hoje o SMTP; teto `EMAIL_LIMITE_HORA`/`EMAIL_LIMITE_DIA` por janela deslizante em `emails_disparos`; um envio por destinatário com `chave` idempotente; fila `emails` no 6º Worker e `marketing` no 7º de `worker:certificados`; conteúdo em TEXTO no `montarEmail`; clique/abertura assinados; descadastro por HMAC com `List-Unsubscribe` RFC 8058; ganchos das automações DENTRO de `webhooks/emitir.ts`, nunca lançam; reenvio do primeiro acesso pela regra do link) | `src/lib/marketing/` (`regras.ts` puro, `provedor.ts` + `provedor-falso.ts` (testes), `fila.ts`, `publico.ts` = regra única do público, `campanhas.ts`, `modelos.ts`, `automacoes.ts`, `gatilhos.ts`, `execucoes.ts`, `envio.ts`, `reenvio.ts`, `descadastro.ts`, `tokens.ts`, `rotas.ts`, `consultas.ts`); actions `campanhas.ts`, `automacoes.ts`; rotas `/api/email/abertura`, `/api/email/clique`, `/api/email/descadastro` — ADR-0020, RN-220 a RN-227, `docs/back.md` "Fase 3". Testes NUNCA enviam e-mail (`ProvedorFalso`) |
| Deploy da PRODUÇÃO no Easypanel, sem HML (ADR-0017 sobre o desenho do ADR-0016: serviços App `li-` no projeto `lideranca`, imagens do CI no GHCR com tag `prd` e `VERSAO_IMAGEM`=SHA, Trigger URL só depois do CI verde na `master` e com `PRD_ATIVO=true`, `li-ferramentas` faz o BACKUP do banco no R2 antes de migrar e grava a marca da versão; app/workers só liberam a versão marcada; healthcheck NA IMAGEM) | `deploy/easypanel/` (`servicos.md`, `env.exemplo`, `ferramentas.sh`, `backup.sh` + `backup.Dockerfile`, `banco-bootstrap.sql`, `storage.Dockerfile`, `disparar-deploy.sh`), `deploy/docker/` (imagens app e worker), `scripts/db-migrar.ts`, `src/lib/db/migracoes.ts`, jobs `deploy-prd`/`voltar-prd` — ADR-0017, runbook `docs/deploy-easypanel.md`. HML futura em VPS dedicada: `deploy/hml/` (ADR-0015, `docs/deploy-hml.md`). Variável nova do app também vai nos dois `env.exemplo` e no compose. Seed de demonstração NUNCA em produção |
| Validadores | `src/lib/validators/<entidade>.ts` |
| Actions | `src/lib/actions/<entidade>.ts` |
| Telas | `src/app/(app)/<rota>/page.tsx` + `_components/` |
| Modal de confirmação | `src/components/modal-confirmacao-block.tsx` |
| Arquivos-ouro | `templates/` (schema, validator, server-action, component, component.test) |
| Skills | `.agents/skills/` (`criar-tabela`, `criar-crud`, `criar-componente`, `repo-docs-sync`, `remove-ai-marks`) |

## Fluxo — funcionalidade nova

1. `npm run map` e leia `docs/PROJECT_MAP.md`: já existe algo parecido?
2. Construa de baixo para cima, copiando o arquivo-ouro de `templates/`:
   tabela (`criar-tabela`) → validador → action (`criar-crud`) → tela (`criar-componente`).
3. Escreva o teste junto — o caminho crítico (bloqueio, permissão, colisão) tem teste.
4. Regra nova em `docs/regras-negocio.md`; decisão nova em `docs/adr/`.
5. `npm run verificar` e `npm run build`. Reporte a saída REAL dos comandos.

## Fluxo — correção de bug

1. Reproduza e leia o estado antes de editar. Confira a trilha (`auditoria`): quem, o quê, quando.
2. Localize a camada: registro "sumiu" → a consulta usa `vivos()`? Edição sobrescreveu
   outra → o `updated_at` original chegou na action? Acesso indevido → `exigirMembro`
   com o papel certo? Autoria errada → `modified_by` veio da sessão?
3. Corrija a CAUSA: procure todos os chamadores da função e corrija no ponto compartilhado.
4. Escreva o teste que falharia com o bug vivo; depois corrija.
5. `npm run verificar`. Reporte: sintoma × causa, arquivos alterados, saída dos comandos.

## Comandos

```bash
npm run db:up          # sobe o Postgres local (Docker)
npm run db:generate    # gera migração a partir do schema
npm run db:migrate     # aplica migrações
npm run dev            # app local
npm run verificar      # lint + tipos + auditor + trava + testes + drift de docs
npm run build          # build de produção
npm run compliance     # só o auditor
npm run map            # regenera docs/PROJECT_MAP.md
npm run lixo           # lista arquivos-lixo na raiz (simulação)
```

## Git

- `develop` recebe o trabalho (só CI: não há HML, ADR-0017); `master` só por merge da `develop` com CI
  verde (deploy PRD, com backup do banco antes). NUNCA commitar direto na `master`. Mudança grande
  (migração que transforma dado, deploy, auth) se valida antes no compose local de teste.
  Seed NUNCA roda no deploy: só à mão (`docs/deploy-easypanel.md`); `seed:demo*` nunca em produção.
- Conventional Commits em PT-BR (`docs/git-commits.md`), sem rodapé de coautoria.
- O pre-commit (`.githooks/pre-commit`) roda o auditor e bloqueia `.env`. Não use
  `--no-verify`. O CI roda tudo de novo.
- NUNCA deploy em PRD sem backup do banco (o pipeline já exige).

## Antes de dizer "pronto"

Rode `docs/definition-of-done.md`. No mínimo:

- [ ] `npm run verificar` verde e `npm run build` passando — com a saída colada no relatório
- [ ] Tabela nova com `...colunasAuditoria`, `instante()`, FK restrict, migração revisada
- [ ] Leitura com `vivos()`; edição e exclusão com `travaDeColisao()`
- [ ] Action com sessão, permissão, Zod, transação e auditoria
- [ ] Ação crítica com `ModalConfirmacaoBlock`
- [ ] Regra de negócio documentada; nenhum segredo exposto

Tarefa que toca login ou conta: siga também `docs/seguranca-login.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
