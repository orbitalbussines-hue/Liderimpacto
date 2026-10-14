# Conventional Commits

## Formato

```
<tipo>(<escopo>): <descricao no imperativo>

[corpo opcional — o porque, nao o que]

[rodape opcional — BREAKING CHANGE, refs de issue]
```

Exemplos:

```
feat(lancamentos): adiciona exclusao logica com trava de colisao
fix(auth): le papel do banco em vez do token
refactor(actions): centraliza regra de margem em contratos
chore(deps): atualiza drizzle-orm
```

## Tipos

| Tipo | Quando | Versao |
|------|--------|--------|
| `feat` | Funcionalidade nova | MINOR |
| `fix` | Correcao de bug | PATCH |
| `refactor` | Muda estrutura, nao comportamento | — |
| `perf` | Desempenho | PATCH |
| `test` | Testes | — |
| `docs` | Documentacao | — |
| `chore` | Build, dependencias, config | — |
| `ci` | Pipeline | — |
| `style` | Formatacao | — |

## Regras

- Em PT-BR, imperativo, minuscula, sem ponto final: "adiciona", nao "adicionado".
- Escopo = modulo afetado.
- Breaking change: `feat!:` e/ou rodape `BREAKING CHANGE: ...`.
- Um commit = uma mudanca coesa.
- Sem rodape de coautoria de IA.
- Trabalho entra na `develop`; `master` so por merge validado em HML.
