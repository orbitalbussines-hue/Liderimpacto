# Definition of Done (DoD)

Uma tarefa so esta "pronta" quando TODOS os itens abaixo sao verdadeiros.
Vale para devs e para agentes de IA. Antes de dizer "concluido", rode o checklist.

## Codigo

- [ ] Faz exatamente o que foi pedido — nada a mais, nada a menos.
- [ ] Nenhum arquivo novo na raiz (usa `src/`, `tests/`, `docs/`, `config/`, `scripts/`).
- [ ] Nenhum arquivo com mais de 500 linhas.
- [ ] Logica de negocio centralizada (nao duplicada entre telas/menus).
- [ ] Leu o arquivo antes de editar.

## Banco de Dados

- [ ] Tabela nova usa `...colunasAuditoria` (5 colunas) e `instante()` em toda data.
- [ ] FK com `onDelete` e `onUpdate` `restrict` explicitos; migracao gerada e revisada.
- [ ] Exclusao e soft delete (`marcaDeExclusao`), nunca delete fisico.
- [ ] Toda leitura usa `vivos()`.
- [ ] Edicao e exclusao usam `travaDeColisao()` (optimistic locking).
- [ ] PostgreSQL (nunca SQLite) + Drizzle (nunca Prisma).

## Seguranca e Auditoria

- [ ] Autenticacao + RBAC verificados na action.
- [ ] Entrada validada (Zod + regex onde aplicavel).
- [ ] Mutacao gera auditoria na mesma transacao (quem/o que/quando).
- [ ] Nenhum secret, `.env` ou credencial commitado.
- [ ] Acao critica passa por modal de confirmacao com block de 3s.

## Login e Conta (so se a tarefa toca autenticacao)

Regua completa em `docs/seguranca-login.md`.

- [ ] Rota/action de escrita nova tem guarda, provada por varredura (nao por leitura).
- [ ] Recusa de login e **unica** — mesma resposta e mesmo tempo para todos os casos.
- [ ] Papel e `is_active` lidos do banco, nao do token.
- [ ] Politica de senha roda em todo caminho que grava senha (e em nenhum que so confere).
- [ ] Login, falha, bloqueio e recusa 403 vao para a trilha; a trilha nao aceita `DELETE`.
- [ ] Segredo de maquina so em cabecalho, comparado em tempo constante.
- [ ] Versao instalada (lockfile) da lib de auth e do framework conferida contra advisories.

## Qualidade

- [ ] `npm run verificar` verde (lint, tipos, auditor, trava do auditor, testes, docs).
- [ ] Caminho critico tem teste.
- [ ] `npm run build` passa.
- [ ] Saida real dos comandos colada no relatorio da tarefa.

## Documentacao e Processo

- [ ] Regra de negocio nova registrada em `docs/regras-negocio.md`.
- [ ] Decisao de arquitetura significativa virou ADR em `docs/adr/`.
- [ ] Commit segue Conventional Commits (`docs/git-commits.md`).
- [ ] Backup do banco feito ANTES de deploy em PRD.
