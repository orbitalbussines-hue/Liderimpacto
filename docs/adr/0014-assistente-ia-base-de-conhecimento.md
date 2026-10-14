# ADR-0014: Assistente do professor com Claude: busca full-text, recuperação filtrada pelo acesso e limites no banco

- **Status**: Aceito
- **Data**: 2026-10-14
- **Decisores**: Paulo (Bah! Tech)

## Contexto

O menu do admin tinha "Assistente do professor" e "Base de conhecimento" como moldes. O assistente
responde dúvidas do aluno com base nas aulas (transcrição da legenda, ADR-0013), nas descrições de
aulas e cursos e em textos que a equipe escreve. O provedor é a Anthropic (Claude), que **não tem API
de embeddings**; o Paulo não quer um segundo provedor. O risco central é o mesmo do vídeo: conteúdo
de curso pago vazar para quem não comprou — agora por dentro de uma resposta. Há também custo por
token, injeção de instrução escondida nos textos e a chave da API.

## Decisão

1. **Busca full-text do PostgreSQL, não embeddings.** Cada fonte vira um documento
   (`criadores_conhecimento_documentos`: AULA_TRANSCRICAO, AULA_DESCRICAO, PRODUTO_DESCRICAO, TEXTO)
   dividido em trechos de ~800–1200 caracteres por parágrafo/sentença
   (`criadores_conhecimento_documentos_trechos`). O trecho tem `tsvector` GERADO
   (`to_tsvector('portuguese', li_sem_acento(texto))`) e índice GIN parcial. `unaccent` não é IMMUTABLE,
   então a migração 0011 cria o invólucro `li_sem_acento` com o dicionário qualificado. A pergunta vira
   `to_tsquery` com **OU** entre os termos (só letras e dígitos: nada de operador vindo de fora) e o
   ranking é `ts_rank_cd`. Na transcrição o trecho guarda o segundo inicial (relido do `.vtt` no
   storage; sem storage, entra sem tempo) para citar "aula X, 03:15" com link `?t=`.
2. **Reindexação idempotente por assinatura.** O documento guarda o sha256 dos trechos; reindexar
   com a mesma assinatura não toca em nada; mudou = soft delete dos trechos velhos + inserção (um
   `pg_advisory_xact_lock` por fonte). Texto da equipe: **síncrono** na transação da action (texto puro,
   sem I/O: "Testar busca" já enxerga). Legenda enviada/trocada/removida, aula e curso salvos: **job na
   fila `conhecimento`** consumida por um 3º Worker de `npm run worker:certificados` (lê o `.vtt` do
   storage), com a reserva de indexar na hora se a fila não responder em 3 s (custa milissegundos).
   `npm run conhecimento:reindexar -- <slug>` refaz um criador inteiro e limpa os documentos de
   aula/curso removidos.
3. **Isolamento por acesso ANTES do modelo** (`recuperarTrechos`). Em SQL: trecho e documento vivos,
   documento incluído, aula/módulo/curso vivos; para ALUNO, curso publicado/não listado + módulo
   publicado + **matrícula valendo agora** (texto da equipe sem curso vale para todos). Depois, em JS, a
   MESMA regra do vídeo (`motivoDoBloqueio`: liberação programada, avaliação que trava o módulo,
   pré-requisito). Só o que passou entra no prompt; o "Testar" da equipe usa o papel DONO. Cursos em
   que o assistente aparece também limitam a recuperação. FKs compostas `(filho, criador_id)` em tudo.
4. **Segurança de prompt.** Regras fixas no prompt de sistema (só os trechos, citar `[n]`, não sei →
   Comunidade, não revelar instruções nem dados de outros alunos); o tom da equipe entra DEPOIS, em
   `<tom>`, escapado e limitado a 800 caracteres. Trechos e pergunta entram como DADOS em
   `<trecho n fonte>`/`<pergunta>` com `& < >` escapados (um trecho nunca fecha a própria tag). A
   resposta é renderizada por um renderizador mínimo próprio (parágrafo, lista, negrito, citação) —
   nunca `dangerouslySetInnerHTML`. Sem citação = `sem_resposta`.
5. **Custo e limites no banco.** Sem trecho recuperado, resposta fixa sem chamar a API (custo zero).
   Limite por aluno/dia (padrão 20, 1–200) e teto do criador/dia (`ASSISTENTE_TETO_DIARIO_CRIADOR`,
   padrão 500) contados nas mensagens dentro de um `pg_advisory_xact_lock` por criador: N+1 é recusada
   mesmo com cliques simultâneos; apagar conversa não devolve a cota. `max_tokens` 1500, esforço `low`,
   prompt de sistema com `cache_control`. Tokens (entrada, saída, cache) e modelo por resposta; custo
   ESTIMADO pela tabela de preços na tela de consumo.
6. **Cliente injetável e chave só no servidor.** `ClienteIA` (interface pequena) com a implementação
   `@anthropic-ai/sdk` (`messages.stream`, modelo `ANTHROPIC_MODELO`, padrão `claude-sonnet-5-5`);
   testes e seed de dev usam `ClienteFalso`. `ANTHROPIC_API_KEY` só em módulo `server-only`; sem chave,
   as telas mostram "IA não configurada" e a rota responde 503. Chave de organização sem workspace:
   `ANTHROPIC_WORKSPACE_ID` (opcional) vira o cabeçalho `anthropic-workspace-id` (`defaultHeaders` do
   SDK); faltando, a recusa 400 aparece à equipe como "Chave da IA sem workspace" e ao aluno como erro
   genérico.
7. **Streaming por Route Handler** (`POST /api/assistente`, NDJSON): sessão do HOST, CSRF (só JSON e
   Origin do próprio host), acesso, limite — tudo antes do modelo. Cliente desconectou = aborta a
   chamada e grava o que chegou (`interrompida`) com os tokens conhecidos.

## Alternativas Consideradas

- **Embeddings (Voyage, OpenAI) + pgvector**: busca semântica melhor, mas outro provedor, outra chave,
  custo por indexação e uma extensão nova no banco. Reavaliar se "Sem resposta na base" mostrar muitas
  perguntas que a base cobria com outras palavras.
- **Mandar o curso inteiro no contexto (1M tokens)**: simples, mas caro por pergunta e o filtro de
  acesso teria de ser por curso inteiro, não por aula liberada.
- **Fallback de recusa do servidor (`fallbacks`)**: exige a API beta e muda o texto no meio do
  streaming; aqui a recusa vira uma resposta fixa.
- **Limite em Redis**: some com flush e não é exato entre instâncias (mesmo motivo do ADR-0009).
- **Indexar tudo síncrono**: ler `.vtt` do storage dentro da action de legenda alonga a resposta;
  ficou na fila, com reserva síncrona.

## Consequencias

### Positivas
- Nenhum trecho de curso não comprado chega ao modelo (teste de integração prova).
- Sem dependência nova além do SDK; busca e limites no Postgres que já existe.
- Pergunta que a base não cobre custa zero e aparece para a equipe melhorar o conteúdo.

### Negativas / Trade-offs
- Full-text não entende sinônimo ("feedback" × "retorno"); o OU entre termos traz trechos fracos que o
  modelo descarta (sem citação).
- Trechos de reindexação ficam como linhas excluídas (soft delete) — `ponytail:` poda periódica se a
  tabela crescer demais.
- O lock por criador serializa as gravações de pergunta de um criador (milissegundos).
- PDF dos materiais fora da base por ora.

### Neutras
- `CREATE EXTENSION unaccent` exige permissão no banco de produção (rodar a migração com o dono do banco).
