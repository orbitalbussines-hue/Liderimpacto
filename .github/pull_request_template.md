# Descricao

<!-- O que esta PR faz e por que. Link para issue/ADR se houver. -->

## Tipo

- [ ] feat (nova funcionalidade)
- [ ] fix (correcao de bug)
- [ ] refactor
- [ ] docs
- [ ] chore / ci

## Checklist (Definition of Done)

> Detalhes em `docs/definition-of-done.md`.

### Banco e dados
- [ ] Tabelas novas com `...colunasAuditoria`, `instante()` e migracao revisada.
- [ ] FK restrict; exclusao por `marcaDeExclusao`; leitura com `vivos()`; edicao com `travaDeColisao()`.
- [ ] PostgreSQL + Drizzle (sem SQLite, sem Prisma).

### Seguranca e auditoria
- [ ] Autenticacao + RBAC na action.
- [ ] Entrada validada (Zod + regex).
- [ ] Mutacao gera auditoria.
- [ ] Acao critica com modal block 3s.
- [ ] Nenhum secret/`.env` commitado.

### Qualidade
- [ ] `npm run verificar` verde.
- [ ] `npm run build` passando.
- [ ] Caminho critico coberto por teste.

### Processo
- [ ] Regra de negocio nova em `docs/regras-negocio.md`.
- [ ] Decisao de arquitetura em `docs/adr/` (se aplicavel).
- [ ] Commits no padrao Conventional Commits.

## Como testar

<!-- Passos para o revisor validar localmente. -->

## Screenshots / evidencias

<!-- Se houver mudanca de UI. -->
