# ADR-0008: Avaliações com gabarito separado, certificado com PDF versionado em fila própria e trilhas

- **Status**: Aceito
- **Data**: 2026-10-14
- **Decisores**: Paulo (Bah! Tech)

## Contexto

O passo 7 (SISTEMA.md §3 itens 7–9) traz avaliações (correção, tentativas, liberação por
aprovação), certificados (emissão automática, PDF, verificação por código/QR) e trilhas. As regras
do cliente ainda não existem (pendência "política de certificados e nota mínima"): RN-123 a RN-129
registram padrões configuráveis. A base exige documento versionado (v1, v2…, histórico) e job
demorado em fila FIFO, enfileirado depois do commit. O gabarito não pode chegar ao navegador antes
da correção e um aluno não pode ganhar certificado duas vezes nem antes da hora.

## Decisão

1. **Questões com opções em jsonb e gabarito em COLUNA SEPARADA** (`produtos_avaliacoes_questoes`:
   `opcoes` = `{ id, texto }[]` com ids por posição "a".."h"; `gabarito` = ids das corretas). Opção
   e questão são editadas juntas, sempre lidas juntas e nunca consultadas sozinhas: uma tabela de
   opções só somaria joins e travas. A separação é o que protege o gabarito: as consultas do aluno
   escolhem coluna a coluna e `gabarito`/`explicacao` só são selecionados no resultado de tentativa
   finalizada, quando `revelaGabarito` deixa (Quiz/Simulado sempre; Prova só aprovado ou sem
   tentativa). Zod valida a estrutura (2–8 opções, 1 correta em Única/V-F) e CHECKs no banco.
2. **Tentativa numa linha** (`produtos_avaliacoes_tentativas`): respostas em jsonb
   `{ questaoId: ids[] }` com autosave por `respostas || jsonb_build_object(...)` (atômico, duas
   questões salvas juntas não se perdem), ordem sorteada congelada (`ordem`) e correção congelada
   (`correcao`, a questão pode mudar depois). Uma aberta por vez = índice único parcial +
   `pg_advisory_xact_lock` no par. Prazo conferido no servidor; tentativa vencida fecha na próxima
   leitura/escrita (sem job). Concessões numa tabela própria (soma dos vivos).
3. **Liberação do módulo dentro de `motivoDoBloqueio`** (motivo `AVALIACAO`, entre LIBERACAO e
   PRE_REQUISITO): `avaliacaoPendenteSql` no `acessoDaAula` e a mesma regra em JS em
   `cursoDoAluno`/`aulaParaPlayer`. Uma regra para vídeo, chave, progresso, curso e player.
4. **Emissão idempotente pelo banco**: único parcial (membro, produto) + `on conflict do nothing`
   numa transação que também cria a v1. Gatilhos: conclusão da matrícula (`registrar.ts`),
   aprovação (`finalizarTentativa`) e a tela de certificados do aluno (recupera quem ficou elegível
   sem evento). `verificarEmissao` nunca derruba quem chamou (log CRITICAL).
5. **PDF versionado**: cada versão congela os dados (`produtos_certificados_versoes.dados`) e, pronta,
   aponta um registro em `arquivos` (finalidade `CERTIFICADO`, nova na lista do banco; a de envio
   continua só IMAGEM/MATERIAL) com a chave fixa `criadores/<c>/certificados/<id>/v<N>.pdf`.
   Download e página pública servem a última PRONTA por URL assinada de 5 min.
6. **Fila e worker próprios**: `certificados` (BullMQ, mesmo Redis e prefixo do vídeo: chaves
   `li:certificados:*`), payload `{ versaoId }`, `jobId` = versaoId, 3 tentativas, DLQ, FALHOU com
   erro legível. Worker separado (`npm run worker:certificados`, concorrência 2) — e não o de vídeo:
   o vídeo roda 1 por vez com FFmpeg por minutos, e um PDF de ~50 ms não pode esperar atrás dele.
   Ao subir, o worker reenfileira as versões PENDENTES (fila fora do ar na hora do pedido).
7. **pdf-lib + @pdf-lib/fontkit, QR pelo `uqr`** (já no projeto): JS puro, sem Chromium nem binário
   no worker. **Fontes**: `@fontsource/newsreader` e `@fontsource/plus-jakarta-sans` (OFL-1.1),
   arquivos **WOFF 1** estáticos por peso lidos de `node_modules` — o fontkit lê WOFF; o WOFF2 quebra
   no subset (testado) e os `@fontsource-variable` só têm WOFF2 variável. Sem copiar fonte para o
   repositório (a licença vai junto do pacote). Só o subconjunto "latin" (pt-BR inteiro).
8. **Código de verificação**: 10 caracteres de um base32 sem ambíguos (sem 0/O/1/I), Web Crypto,
   único na plataforma (índice em todas as linhas). A verificação é por HOST: código de outro
   criador = 404.

## Alternativas Consideradas

- **Tabela de opções** (`..._questoes_opcoes` com `correta`): o gabarito ficaria numa coluna da
  mesma linha que vai à tela — um `select *` vazaria. Mais joins para nada.
- **Tabela de respostas por questão**: útil para estatística por questão (passo 15); hoje só
  somaria escritas. O jsonb congelado dá para migrar depois.
- **Puppeteer/Chromium para o PDF**: layout em HTML, mas ~300 MB no worker e um navegador para
  manter; pdf-lib basta para um certificado de página única.
- **Estender o worker de vídeo**: mesma fila/concorrência do FFmpeg; um PDF esperaria horas.
- **Gerar o PDF na action**: segura a resposta e foge da regra da base (job demorado em fila).
- **Código sequencial/curto**: adivinhável; 10 símbolos de 32 = 50 bits.

## Consequências

### Positivas
- O gabarito não tem caminho até o aluno antes da correção (teste prova o JSON da tela).
- Certificado duplicado é impossível pelo banco; histórico de PDFs completo e reprodutível.
- Trocar o layout = nova versão; os PDFs antigos continuam no storage.

### Negativas / Trade-offs
- Editar opções de uma questão durante uma tentativa aberta pode mudar o sentido das ids por
  posição (`ponytail:` aceito; a correção da tentativa já finalizada fica congelada).
- Código de verificação gerado sem retry: colisão (1 em 2^50 por par) falharia a emissão; o
  próximo gatilho tenta de novo com outro código.
- Letras fora do latin (ex.: "ł") saem como glifo vazio no PDF até somar os arquivos latin-ext.
- Tentativa vencida só fecha quando alguém a toca (lista, página, resposta): a nota entra no
  "melhor" nessa hora.

### Neutras
- Revogar não apaga nada; a página pública diz "revogado".
- A equipe pode fazer tentativa de prévia; estatísticas contam só ALUNO.
