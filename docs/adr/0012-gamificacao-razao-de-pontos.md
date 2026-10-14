# ADR-0012: Gamificação com razão de pontos append-only, tudo calculado e desafios por janela; segundos por dia no heartbeat

- **Status**: Aceito
- **Data**: 2026-10-14
- **Decisores**: Paulo (Bah! Tech)

## Contexto

O criador quer pontos, níveis, ranking e desafios (com recompensa entregue pela equipe) para
engajar os alunos. Pontos são dinheiro de mentira: se um evento for processado duas vezes (dois
cliques, retry, recálculo) não pode dar ponto em dobro, e a equipe precisa corrigir com rastro. O
ranking soma por semana/mês/total com milhares de alunos. O analytics também pediu horas assistidas
POR PERÍODO (RN-139), que dependia de uma coluna nova na mesma tabela quente do heartbeat.

## Decisão

1. **Configuração 1:1** `criadores_gamificacao` (ligada, pontos por ação, `niveis` jsonb validado por
   `esquemaNiveis`), uma linha viva por criador; SEM linha = desligada com os padrões (RN-144). Tabela
   própria (e não colunas em `criadores`): trava otimista e trilha próprias, `criadores` fica enxuta.
2. **Razão append-only** `criadores_membros_pontos` (`compliance:append-only`, como a `auditoria`):
   motivo, pontos (negativo SÓ em AJUSTE_MANUAL — CHECK), `referencia`, `ocorrido_em`, `justificativa`
   (obrigatória no ajuste — CHECK), `modified_by` = quem lançou. **Índice único (membro, motivo,
   referência) em todas as linhas + `ON CONFLICT DO NOTHING`** = idempotência: referência é a aula, o
   curso, a avaliação, o desafio, o DIA de Brasília (1ª publicação do dia) ou um uuid novo (ajuste).
   Correção = ajuste com sinal contrário; nada se altera nem se apaga.
3. **`ocorrido_em` ≠ `created_at`**: o ranking por período usa a data do FATO. O recálculo retroativo
   de uma aula concluída há 3 meses não cai na semana atual.
4. **Tudo calculado**: saldo, nível, posição e ranking = soma do razão (`src/lib/gamificacao/ranking.ts`);
   índice `(criador_id, ocorrido_em, membro_id, pontos)` faz a soma por período só pelo índice. Sem
   saldo gravado que possa divergir. A tela cacheia com `"use cache"` de minutos.
5. **Concessão em um lugar** (`src/lib/gamificacao/pontos.ts`): `concederPontos(exec, …)` (uma
   instrução: só ALUNO vivo, só gamificação ligada, valor da configuração > 0) e `registrarConquista`
   (concede + conclui desafios; chamada DEPOIS do commit e nunca lança — como `verificarEmissao`).
   Os fluxos que ligam (progresso, matrícula concluída, aprovação, publicação) são do agente de telas.
6. **Desafios por janela** (`criadores_desafios` + `_grupos` + `_participacoes`): meta AULAS_CONCLUIDAS
   (n) | CURSO_CONCLUIDO (curso) | AVALIACAO_APROVADA (avaliação) | PUBLICACOES_COMUNIDADE (n) com CHECK
   de coerência; opt-in "Participar"; PROGRESSO CALCULADO dos dados existentes entre `inicio_em` e
   `fim_em` (`progressoDoDesafioSql`), nunca um contador. A conclusão é UMA instrução (CTE: cumpridas →
   `UPDATE … concluido_em` onde ainda nulo → `INSERT` do bônus DESAFIO_CONCLUIDO), idempotente; a
   recompensa é marcada pela equipe (`recompensa_entregue_em/por`). Público: o MESMO `vePublicoSql` dos
   eventos (ADR-0011).
7. **Ligar = recalcular**: desligada não concede nada; ao ligar (e por `npm run gamificacao:recalcular
   -- <slug>`) `recalcularPontos` gera os lançamentos dos fatos já existentes, por conjunto (`INSERT …
   SELECT` por motivo), idempotente. Nada se perde por o criador ligar tarde.
8. **Sair do ranking** = `usuarios.aparecer_no_ranking` (preferência da PESSOA, junto de "Lembretes";
   RN-121/146): esconde do ranking, não zera pontos.

### Também nesta migração: horas assistidas por período (RN-139)
9. **`criadores_membros_atividades.segundos`** = segundos ÚNICOS NOVOS do dia. A batida continua
   UMA instrução (ADR-0006): o `DO UPDATE` calcula `segundos_novos = bits(OR) − bits(antes)` sobre a
   versão TRAVADA da linha (coluna de sistema nova em `produtos_modulos_aulas_progressos`, como
   `visualizacao_nova`) e a CTE `ativ` soma no dia com `ON CONFLICT DO UPDATE`. Batidas simultâneas se
   enfileiram na trava: nenhum segundo conta duas vezes (teste com 5 batidas em paralelo). Medido
   (1.000 batidas sequenciais, Postgres local): **5,5–5,7 ms → 6,0–6,5 ms** por batida (+~0,6 ms: uma
   linha a mais atualizada). `horasAssistidas` sem curso soma o período e o anterior; com curso segue
   ACUMULADO (o dia não guarda a aula). Dias antes da migração valem 0.
10. **Índices do analytics** confirmados por EXPLAIN com volume sintético (10 criadores, 90 mil
   progressos, 9 mil tentativas, numa transação desfeita): `progressos (criador_id, aula_id) where
   vivo` — horas por curso 251 → 35 ms, ativos por curso 238 → 13 ms; `tentativas (criador_id,
   finalizada_em) where finalizada e viva` — 0,38 → 0,13 ms. **Sem INCLUDE** no do progresso: a batida
   já reescreve as entradas de todos os índices (o `updated_at` é indexado: não há HOT update) e coluna
   incluída só engordaria a escrita quente; o bitmap scan bastou.

## Alternativas Consideradas

- **Saldo na tabela de membros** (contador): rápido de ler, mas diverge no primeiro retry/erro e não
  explica de onde veio cada ponto. O razão é a verdade; um agregado por dia vira `ponytail:` se a soma
  pesar (~1 milhão de lançamentos por criador).
- **Contador de progresso do desafio**: diverge quando um post é removido, uma aula é concluída pelo
  botão ou o recálculo roda; o cálculo pela janela é sempre o mesmo.
- **Dar pontos com a gamificação desligada** (e só esconder): grava razão de quem não pediu; ligar
  depois com o recálculo dá o mesmo resultado.
- **Calcular `segundos_novos` com uma CTE que lê a linha antes do upsert**: a CTE vê o snapshot do
  início da instrução; duas batidas simultâneas contariam o mesmo trecho. Só o valor da trava de linha
  (`p.` no DO UPDATE) é seguro — e o PG 16 não tem `RETURNING old.*`, daí a coluna.

## Consequências

### Positivas
- Reprocessar qualquer coisa é seguro; todo ponto tem origem (motivo + referência) e o ajuste tem autor
  e trilha.
- Ranking honesto por período mesmo para pontos retroativos.

### Negativas / Trade-offs
- Ranking/resumo somam por requisição (cache curto na tela). `resumoDoMembro` soma todos os membros do
  criador para achar a posição (milhares: ok).
- Uma escrita a mais por batida (atividade do dia) no caminho quente (+0,6 ms medidos).
- Lançamento de aula/curso concluído não volta se o aluno perder a matrícula (o fato aconteceu).

### Neutras
- A equipe (DONO/ADMIN) não pontua nem aparece no ranking; ajuste manual só para ALUNO.
