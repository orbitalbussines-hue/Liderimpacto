# Backend

O backend e o proprio Next.js: Server Components leem, Server Actions escrevem.
Rota de API (`app/api/**/route.ts`) so para quem nao e a tela: webhook, integracao, cron.

## Camadas

```
src/lib/
  db/
    index.ts              # unica conexao (db, Transacao)
    soft-delete.ts        # vivos(), travaDeColisao(), marcaDeExclusao()
    schema/
      _compartilhado.ts   # instante(), dinheiro(), colunasAuditoria
      _enums.ts           # listas de enum (text + CHECK)
      index.ts            # reexporta as tabelas
      <tabela>.ts
    migrations/           # geradas por drizzle-kit — revisar antes de aplicar
  validators/<entidade>.ts  # Zod
  actions/<entidade>.ts     # Server Actions: a regra de negocio mora aqui
  audit/registrar.ts        # trilha, dentro da transacao
  auth/sessao.ts            # obterSessao / obterSessaoDeSeguranca (Better Auth, ADR-0003)
  auth/autorizacao.ts       # exigirSessao / exigirMembro / exigirSuperAdmin (actions)
  auth/guarda.ts            # sessaoDaPagina / membroDaPagina / superAdminDaPagina
  criador/                  # criadorDoHost, criadorAtual (o criador vem do host)
  acao.ts                   # executar() / ErroDeNegocio / Resultado
```

## O caminho de uma escrita

```
tela -> action(dados, updatedAtOriginal)
          executar(async () => {
            exigirMembro(papeis)           # sessao + criador do host + papel (docs/rbac.md)
            schema.parse(...)              # Zod em TODO parametro
            db.transaction(tx =>
              tx.update(...).where(travaDeColisao(...))   # 0 linhas = colisao
              registrarAuditoria(tx, ...)                 # mesma transacao
            )
            revalidatePath(rota)
          })  -> { ok: true, dados } | { ok: false, erro }
```

A implementacao de referencia e `templates/server-action.ts`. Nao copie trechos daqui:
copie o template.

## Actions de membros, grupos, aparencia e criadores (passo 2)

| Action | Arquivo | Quem | Regra |
|--------|---------|------|-------|
| `acaoCadastrarMembro`, `acaoImportarMembros` | `src/lib/actions/membros.ts` | DONO, ADMIN (ADMIN so ALUNO) | RN-104, RN-106 |
| `acaoMudarPapel` | `src/lib/actions/membros-gestao.ts` | DONO | RN-104 |
| `acaoAlterarSituacaoMembro`, `acaoRemoverMembro`, `acaoDefinirGruposDoMembro` | `src/lib/actions/membros-gestao.ts` | DONO, ADMIN (ADMIN so ALUNO) | RN-104 |
| `acaoCriarGrupo`, `acaoRenomearGrupo`, `acaoRemoverGrupo` | `src/lib/actions/grupos.ts` | DONO, ADMIN | RN-105 |
| `acaoSalvarCorDaMarca` | `src/lib/actions/aparencia.ts` | DONO | RN-107 |
| `acaoCriarCriador`, `acaoAlterarSituacaoCriador` | `src/lib/actions/criadores.ts` | SUPER_ADMIN no apex | RN-108 |

Escrita compartilhada (vinculo, grupos, ultimo DONO com trava de linha) em `src/lib/membros/vinculos.ts`;
regra pura em `src/lib/membros/regras.ts`; leitura das telas em `src/lib/membros/consultas.ts`.

## Regras

1. Acesso ao banco SO pelo `db` de `src/lib/db/index.ts`. Componente nunca importa `db`.
2. Leitura SEMPRE com `vivos(tabela)`. Consulta relacional (`db.query.x.findMany`) com
   `where` que inclua `is_deleted = false`.
3. Escrita SEMPRE com `modified_by: sessao.userId` e, em edicao/exclusao,
   `updated_at: new Date()` + `travaDeColisao`.
4. Erro esperado → `throw new ErroDeNegocio("mensagem para a tela")`. O resto e erro
   inesperado: vai para o log, a tela recebe mensagem generica.
5. Job demorado (PDF, e-mail, sincronizacao) vai para fila FIFO (BullMQ + Redis), e so e
   enfileirado DEPOIS do commit da transacao. Job idempotente, com DLQ e registro na trilha.
6. Documento gerado (PDF, relatorio) tem versao incremental (v1, v2...) e historico.

## Trilha de auditoria

Tabela `auditoria` (append-only): `user_id`, `acao`, `tabela`, `registro_id`, `detalhes`,
`dados_anteriores`, `dados_novos`, `created_at`. Em producao, o usuario de banco da
aplicacao NAO tem `UPDATE` nem `DELETE` nela:

```sql
REVOKE UPDATE, DELETE ON auditoria FROM app_usuario;
```

Nunca grave senha, hash, token ou codigo OTP em `dados_*`.

## Comandos

```bash
npm run db:up         # Postgres local
npm run db:generate   # migracao a partir do schema
npm run db:migrate    # aplica
npm run db:studio     # visualizar o banco
```

## Backup (antes de todo deploy em PRD)

```bash
pg_dump "$DATABASE_URL" --no-owner --no-acl --clean --if-exists \
  --file="backup_$(date +%d_%m_%Y_%H_%M).sql"
```

Backup fica FORA do servidor do banco e o restore e testado em HML. O pipeline de
deploy ja faz o dump e a copia off-server antes do PRD.
