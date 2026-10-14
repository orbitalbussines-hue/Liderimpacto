---
name: criar-crud
description: Implementa o CRUD de uma entidade (listar, criar, atualizar, excluir) centralizado em Server Actions, com sessao, permissao, Zod, transacao, auditoria, soft delete e trava de colisao. Use quando pedirem CRUD, cadastro, "telas de cadastro" ou operacoes de uma entidade.
---

# Criar CRUD de entidade

A regra da entidade mora em UM arquivo. Telas so chamam estas funcoes.

## Pre-requisito

A tabela existe (senao, skill `criar-tabela`).

## Passos

1. **Validador** — copie `templates/validator.ts` para
   `src/lib/validators/<entidade>.ts`. `z.strictObject`, mensagens em PT-BR, regex nos
   formatos criticos (codigo, documento, valor). Schema de edicao com `.omit()` do que
   nao pode mudar.
2. **Actions** — copie `templates/server-action.ts` para `src/lib/actions/<entidade>.ts`:
   - `listar()` — `vivos(tabela)`, para Server Component (lanca em falha)
   - `criar(dados)` — `executar()` + sessao + permissao + Zod + transacao com auditoria
   - `atualizar(id, dados, updatedAtOriginal)` — `travaDeColisao`; 0 linhas =
     `ErroDeNegocio(MSG_COLISAO)`; auditoria com antes e depois
   - `excluir(id, updatedAtOriginal)` — `marcaDeExclusao` + `travaDeColisao`
3. **Papel minimo** de cada acao conforme a matriz de `docs/rbac.md`.
4. **Campo a campo** no `values()`/`set()`. `modified_by` sempre `sessao.userId`.
5. **Tela** — skill `criar-componente`. O `page.tsx` usa `listar()`; o client component
   chama as actions e mostra `r.erro` quando `r.ok === false`.
6. **Testes** — componente (template `component.test.tsx`) e, com banco de teste, os
   caminhos: colisao recusada, soft delete fora da listagem, permissao negada, auditoria
   gravada.
7. **Documente** a regra nova em `docs/regras-negocio.md`.
8. **Valide** — `npm run verificar`.

## Checklist

- [ ] Logica num arquivo so
- [ ] Toda action comeca com `exigirMembro(papeis)` (ou `exigirSuperAdmin()`); o criador vem do host, nunca do corpo
- [ ] Todo parametro validado com Zod (inclusive `id` e `updatedAtOriginal`)
- [ ] Mutacao e auditoria na mesma transacao
- [ ] `listar` com `vivos()`; `atualizar`/`excluir` com `travaDeColisao()`
- [ ] Action que muta devolve `Resultado` (via `executar`)
- [ ] `revalidatePath` da rota afetada
