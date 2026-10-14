# ADR-0007: Painel do admin — dias de atividade por membro e agregados com cache curto

- **Status**: Aceito
- **Data**: 2026-10-14
- **Decisores**: Paulo (Bah! Tech)

## Contexto

A Home do admin (passo 6, RN-122) precisa de "Alunos ativos" no período E no período anterior e
de "Acessos por dia" = alunos DISTINTOS por dia nos últimos 14 dias. Nada do que existia responde:
a linha do progresso guarda só a ÚLTIMA batida (`updated_at`, `ultima_visualizacao_dia`) e o
agregado do Top 10 (ADR-0006) conta pares aula × membro por dia — um aluno que vê 3 aulas no dia
vale 3. O painel não pode varrer o progresso a cada requisição.

## Decisão

1. **Tabela `criadores_membros_atividades` (membro, dia de Brasília)**, única entre as vivas, com
   `criador_id` + FK composta (membro, criador). Escrita na MESMA instrução do upsert do progresso
   (CTE `ativ`, `ON CONFLICT DO NOTHING`), só quando a batida liga `visualizacao_nova` (no máximo 1
   vez por aula/dia), e na conclusão pelo botão. A migração `0005_painel_atividades` carrega o que o
   progresso já sabia (último dia assistido e dia da conclusão de cada linha).
2. **Uma consulta agregada por bloco** (`src/lib/painel/consultas.ts`), período comparado com
   `FILTER` na mesma varredura; limites como meia-noite de Brasília convertida em instante (o
   índice vale; nada de `::date` em UTC). Índice novo: progresso (criador, `concluida_em` desc)
   onde concluída e viva.
3. **Cache curto nos agregados** (`src/lib/painel/cache.ts`): `"use cache"` + `cacheLife("minutes")`
   (revalida a cada 1 min, expira em 1 h) + `cacheTag("painel:<criador>")`, chamado SÓ depois da
   guarda da página. "Acontecendo agora" fica sem cache (é o "agora"; 5 ramos com `LIMIT 8` cada).

## Alternativas Consideradas

- **Somar o agregado do Top 10 por dia**: conta aula × membro, não aluno; o gráfico mentiria.
- **`updated_at` do progresso**: só a última batida; aluno ativo nos dois períodos sumiria do anterior.
- **Linha de trilha (`auditoria`) por batida**: a trilha é append-only e cresce sem limite; seria
  uma escrita a mais por batida no caminho quente.
- **Job noturno que consolida**: mais uma peça para operar; o `INSERT ... DO NOTHING` na mesma
  instrução custa quase nada.

## Consequências

### Positivas
- Ativos e acessos exatos, com histórico, sem tocar no progresso na leitura.
- Cada bloco é uma ida ao banco; o cache segura picos de quem fica recarregando o painel.

### Negativas / Trade-offs
- Histórico de atividade anterior à migração é parcial (só o último dia e a conclusão de cada aula).
- Uma linha por aluno por dia ativo (1.000 alunos ≈ 365 mil linhas/ano: pequeno, indexado).
- Agregados até ~1 min atrasados; ninguém chama `revalidateTag` ainda (a etiqueta existe para isso).
