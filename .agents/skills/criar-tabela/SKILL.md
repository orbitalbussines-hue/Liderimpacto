---
name: criar-tabela
description: Cria uma tabela Drizzle seguindo as regras absolutas do projeto (5 colunas de auditoria, timestamptz(3), FK restrict, soft delete, nome hierarquico, migracao revisada). Use quando pedirem para criar ou adicionar tabela, entidade, model ou coluna no banco.
---

# Criar tabela (Drizzle)

## Passos

1. **Nome hierarquico** em snake_case: a filha herda o prefixo do pai
   (`contratos` → `contratos_lancamentos`). Arquivo em kebab-case:
   `src/lib/db/schema/contratos-lancamentos.ts`.
2. **Copie** `templates/schema.ts` para esse arquivo e ajuste as colunas de dominio.
3. **Auditoria**: `...colunasAuditoria` no fim do objeto. Nunca declare as 5 colunas a mao.
4. **Tipos de coluna**:
   - data/hora → `instante("nome")` (nunca `timestamp("nome")`)
   - dinheiro → `dinheiro("nome")` (nunca `integer`/`real`/`number`)
   - enum → `text("nome", { enum: LISTA })` + `check()` com `listaSql(LISTA)`; a lista
     vai em `schema/_enums.ts`
5. **FK**: `.references(() => pai.id, { onDelete: "restrict", onUpdate: "restrict" })`.
6. **Indices** no terceiro argumento, forma array: `(t) => [index("idx_...").on(t.coluna)]`.
   Unico ou filtro por vivos: indice parcial com `.where(sql\`is_deleted = false\`)`
   (predicado em `sql` cru com literais).
7. **Exporte** `$inferSelect` e `$inferInsert`, e acrescente a linha em
   `src/lib/db/schema/index.ts`.
8. **Migracao**: `npm run db:generate`, LEIA o SQL gerado (FK restrict? nenhum DROP?),
   depois `npm run db:migrate`. Nunca `drizzle-kit push`.
9. **Valide**: `npm run compliance` sem erros.

## Excecoes (so com justificativa escrita no comentario)

- Trilha de auditoria: `// compliance:append-only — <motivo>` acima do `pgTable`.
- Tabela que a biblioteca de auth apaga sozinha (sessao, verificacao):
  `// compliance:framework — <motivo>`.

## Saida esperada

- Schema criado e exportado no `index.ts`
- Migracao em `src/lib/db/migrations/` revisada e aplicada
- `npm run compliance` verde
- Se a tabela nasce de regra do cliente: registro em `docs/regras-negocio.md`
