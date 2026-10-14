# ADR-0006: Progresso em bitmap por segundo, upsert de uma instrução e Top 10 por agregado diário

- **Status**: Aceito
- **Data**: 2026-10-14
- **Decisores**: Paulo (Bah! Tech)

## Contexto

O progresso é o dado mais quente do sistema (`docs/ARQUITETURA.md` §1.4 e §5): uma batida do
player a cada 10 s por aluno assistindo (1.000 alunos ≈ 100 escritas/s), mais as batidas de
pause/seek/fim/saída por `sendBeacon`. A regra do cliente (README, SISTEMA §6) é concluir com
≥ 90% **assistido** — segundos únicos, não posição — e ignorar saltos. Duas batidas podem chegar
juntas (duas abas, beacon + heartbeat). O Top 10 da vitrine são as aulas mais vistas nos últimos
7 dias e não pode ser calculado varrendo o progresso a cada requisição. Sem cron externo agora.

## Decisão

1. **Segundos assistidos = bitmap de 1 bit por segundo** (`bit varying`, comprimento = duração
   da aula) em `produtos_modulos_aulas_progressos.segundos_bitmap`. Mesclar = `OR` bit a bit;
   segundos únicos = `bit_count`.
2. **Uma instrução SQL por batida** (`src/lib/progresso/registrar.ts`): CTE que lê a duração da
   aula, `INSERT ... ON CONFLICT (membro_id, aula_id) WHERE is_deleted = false DO UPDATE` com o
   OR, percentual, conclusão (nunca volta), última/maior posição, e soma a visualização do dia no
   agregado — tudo atômico, uma ida ao banco. A trava de linha do `ON CONFLICT` enfileira batidas
   simultâneas; a segunda mescla sobre a primeira.
3. **Teto anti-salto no banco**: a batida só é aceita se os segundos declarados ≤ 2 × (tempo real
   desde a última batida aceita, pelo `updated_at` da linha) + 15 s (60 s na primeira). Cada trecho
   ≤ 30 s e no máximo 20 trechos por batida (Zod). "Pular para o fim e marcar tudo" exige o tempo
   real de assistir a 2×.
4. **Top 10 = agregado `produtos_modulos_aulas_visualizacoes` (criador, aula, dia de Brasília)**.
   Visualização = um membro com ≥ 1 segundo assistido naquela aula naquele dia (1 por
   membro/aula/dia). A primeira batida do dia liga `visualizacao_nova` na linha do progresso e a
   mesma instrução faz `+1` no dia. O ranking é uma soma de 7 linhas por aula, cacheada por criador
   com `"use cache"` + `cacheLife("hours")` do Next 16 (`src/lib/progresso/top10.ts`).
5. **Limite de frequência** (1 batida / 3 s por sessão e aula) em memória do processo, só para
   poupar o banco; o teto real é o do item 3.

## Alternativas Consideradas

- **jsonb de intervalos mesclados `[[ini,fim],...]`**: mesclar em SQL exige desmontar o jsonb,
  ordenar e reagrupar (ou `SELECT ... FOR UPDATE` + mescla no Node + `UPDATE` = 3–4 idas ao banco
  numa transação). Tamanho imprevisível com aluno que pula muito (precisaria de teto e corte).
- **Bitmap por bloco de 5 s**: 5× menor, mas bloco parcialmente visto ou conta inteiro (inflável
  com trechos minúsculos nas bordas) ou não conta (batidas contíguas que cortam o bloco perdem
  tempo). Com 1 s o erro é ≤ 1 s por trecho e o tamanho continua pequeno: 1 h = 450 bytes,
  12 h (teto do CHECK) = 5,4 KB.
- **Buffer em Redis e gravação em lote**: só quando 100 escritas/s não couberem (ARQUITETURA §5).
  Medido: 5,5 ms por batida sequencial no Postgres local, cabe com folga.
- **Top 10 contando direto na tabela de progresso** (`updated_at` nos últimos 7 dias): perde o
  histórico por dia (a linha só guarda a última batida) e o analytics do passo 15 vai querer o dia.
- **Job agendado (BullMQ repeatable / cron)**: mais uma peça para operar; o `+1` na mesma
  instrução custa quase nada e o cache do Next cobre o "não calcular por requisição".

## Consequências

### Positivas
- Batida = 1 instrução, sem corrida e sem transação longa; o servidor nunca confia no "concluí"
  do cliente.
- Concluir, retomar e o Top 10 saem da mesma linha/agregado, sem job.
- `podeAssistir` virou `motivoDoBloqueio` (mesma regra para token, chave, progresso, materiais e
  telas), agora com pré-requisito.

### Negativas / Trade-offs
- O bitmap é opaco no SQL ad hoc (use `bit_count`); vídeo trocado por outro de outra duração tem
  o bitmap ajustado (corta ou completa com zeros) — a conclusão já dada fica.
- O teto por tempo real pode ignorar uma batida legítima atrasada demais (ex.: aba em segundo plano
  com o timer travado por minutos). O player deve mandar a cada ~10 s e quebrar trechos > 30 s.
- Limite de frequência em memória por instância: com várias instâncias, cada uma conta o seu
  (marcado com `ponytail:` em `batida.ts`).
- O Top 10 cacheado pode ficar até 1 h atrasado.

### Neutras
- Visualização é "membro distinto por dia", não "play": rever a aula no mesmo dia não infla.
