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

## Catálogo e arquivos (passo 3)

| Action | Arquivo | Quem | Audita | Regra |
|--------|---------|------|--------|-------|
| `acaoCriarProduto`, `acaoSalvarProduto`, `acaoAlterarSituacaoProduto`, `acaoDefinirCapaProduto`, `acaoRemoverProduto` | `src/lib/actions/produtos.ts` | DONO, ADMIN | criar / atualizar (campo a campo) / `publicar` / excluir | RN-109, RN-110 |
| `acaoCriarModulo`, `acaoEditarModulo`, `acaoRemoverModulo`, `acaoReordenarModulos`, `acaoCriarAula`, `acaoRemoverAula`, `acaoReordenarAulas` | `src/lib/actions/produtos-estrutura.ts` | DONO, ADMIN | criar / atualizar / excluir / `reordenar` (ordem antes → depois) | RN-111 |
| `acaoSalvarAula`, `acaoDefinirThumbAula`, `acaoAdicionarMaterial`, `acaoRenomearMaterial`, `acaoRemoverMaterial` | `src/lib/actions/aulas.ts` | DONO, ADMIN | criar / atualizar / excluir | RN-111, RN-112 |
| `acaoLinkDoMaterial` | `src/lib/actions/aulas.ts` | DONO, ADMIN | — (leitura: URL de 5 min) | RN-112 |
| `acaoIniciarEnvio`, `acaoConfirmarEnvio` | `src/lib/actions/arquivos.ts` | DONO, ADMIN | criar / atualizar (ou excluir, se o HEAD não bate) | RN-112 |

Tabelas (`src/lib/db/schema/produtos.ts` e `arquivos.ts`): `produtos` → `produtos_modulos` →
`produtos_modulos_aulas` → `produtos_modulos_aulas_materiais`, e `arquivos`. Todas com `criador_id`
e FK composta para o pai do mesmo criador; ordem única por pai entre os vivos. O vínculo aula ×
vídeo NÃO está aqui: o pipeline de vídeo (passo 3b) cria a tabela dele e a coluna na aula.

Leituras das telas em `src/lib/catalogo/consultas.ts`; regra pura (publicação, rótulos) em
`src/lib/catalogo/regras.ts`; invariante "publicado continua publicável" em
`src/lib/catalogo/publicacao.ts`; ordem 1..n em duas fases em `src/lib/catalogo/ordem.ts`
(trava o pai antes; ordem das travas produto → módulo → aula). Decisões no ADR-0004.

### Armazenamento (`src/lib/armazenamento/`)

- `regras.ts` (puro, tela e servidor): `ALLOWLIST`, `validarEnvio(finalidade, {nome, mime, tamanho})`,
  `chaveDoCriador(criadorId, ...segmentos)`, `chavePertenceAoCriador(chave, criadorId)`,
  `chaveDeArquivo(...)`, `mimeDaExtensao`, `atributoAccept`, `formatarTamanho`.
- `cliente.ts` (server-only): `urlDeEnvio` (PUT com tipo e tamanho na assinatura),
  `iniciarEnvioMultipart` / `assinarPartesMultipart` / `concluirEnvioMultipart` /
  `abortarEnvioMultipart`, `urlDeLeitura` (5 min), `urlDeImagem` (janela de 1 h, para o
  `next/image`), `urlDeImagemOuNula`, `cabecalhoDoObjeto` (HEAD), `apagarObjeto`, `prepararBucket`.
  Toda função recebe `{ bucket, criadorId, chave }` e recusa chave fora de `criadores/<criadorId>/`.
- `arquivos.ts` (server-only, dentro da transação de quem chama): `arquivoParaUsar` (deste
  criador, DISPONIVEL, finalidade certa, sem outro uso), `descartarArquivo` (soft delete + trilha,
  devolve a chave) e `apagarObjetosDescartados` (depois do commit, best-effort).
- Buckets criados por `npm run armazenamento:preparar` (idempotente, aplica o CORS).

## Matrículas (passo 4)

Tabela `produtos_matriculas` (`src/lib/db/schema/matriculas.ts`): `criador_id` + FKs compostas
(membro, criador) e (produto, criador); origem `MANUAL|IMPORTACAO|COMPRA`, status
`ATIVA|PENDENTE|CANCELADA` (Expirada = ATIVA com `expira_em` passado, sem job), `iniciada_em`,
`concluida_em` (passo 5), `expira_em`, `referencia_externa` (unica por criador quando presente),
`motivo_cancelamento` (CHECK: obrigatorio quando CANCELADA). Uma linha viva por (membro, produto).
Regras RN-116 e RN-117. Nenhuma variavel de ambiente nova.

### Ponto de entrada do gateway

O webhook de compra (gateway ainda nao escolhido) NAO existe ainda. Quando existir, ele resolve o
criador pela conta do gateway, cria/acha a pessoa com `vincularPessoa` (`src/lib/membros/vinculos.ts`)
e chama, numa transacao, a MESMA funcao que as telas usam:

```ts
// src/lib/matriculas/servico.ts
matricular(tx: Transacao, {
  criadorId: string;            // do host / da conta do gateway, nunca do corpo
  membroId: string;             // criadores_membros.id DESTE criador
  produtoId: string;            // produtos.id DESTE criador
  origem: "MANUAL" | "IMPORTACAO" | "COMPRA";
  expiraEm?: Date | null;       // nula = sem expiracao; passada = recusa
  referenciaExterna?: string | null; // "gateway:eventoId" (^[a-z0-9-]{2,30}:\S{1,200}$)
  autor: string | null;         // usuario da sessao; null = sistema (webhook)
  versao?: Date;                // trava otimista (so a tela usa)
  agora?: Date;
}): Promise<{ matriculaId: string; resultado: "criada" | "reativada" | "ja-existia" }>
```

- Idempotente: a mesma `referenciaExterna` devolve a mesma matricula ("ja-existia") sem mudar nada;
  a referencia ja usada em OUTRO par e recusada. Serializa por par com `pg_advisory_xact_lock`.
- Par com matricula valendo: fica como esta. Cancelada, pendente ou expirada: reativa a MESMA linha.
- `autor: null`: a linha fica com `modified_by` = a pessoa matriculada e a trilha com `user_id` nulo.
- Limite conhecido (`ponytail:` no codigo): uma referencia por linha (a mais recente). Renovacao com
  varios eventos pede uma tabela de eventos do gateway, que entra junto com o webhook.

Outras funcoes do servico: `cancelarMatricula`, `alterarExpiracao` (trava pela versao),
`matricularGrupo`, `membrosDoGrupo`. Leituras em `src/lib/matriculas/consultas.ts`
(`matriculaAtiva(criadorId, membroId, produtoId, agora)`, `valeAgora`, lista/contadores da tela,
`matriculasPorMembro`, `alunosPorProduto`, `cursosDoAluno`); regra pura em `regras.ts`
(`situacaoDaMatricula`, `fimDoDiaEmBrasilia`); CSV em `csv.ts` (mesmo `lerCsv` dos membros).

| Action | Arquivo | Quem | Audita | Regra |
|--------|---------|------|--------|-------|
| `acaoMatricular` (pessoas OU grupo × produtos, expiracao opcional, numa transacao) | `src/lib/actions/matriculas.ts` | DONO, ADMIN | criar / atualizar (reativar) por matricula | RN-116 |
| `acaoCancelarMatricula`, `acaoAlterarExpiracao`, `acaoReativarMatricula` | `src/lib/actions/matriculas.ts` | DONO, ADMIN | atualizar (antes → depois, motivo) | RN-116 |
| `acaoBuscarMembros` | `src/lib/actions/matriculas.ts` | DONO, ADMIN | — (leitura) | RN-116 |
| `acaoImportarMatriculas` | `src/lib/actions/matriculas-importacao.ts` | DONO, ADMIN | conta/vinculo/grupo/matricula + resumo da importacao | RN-117 |

## Variáveis de ambiente (passo 3)

| Variável | Dev (docker-compose) | Produção | Para quê |
|----------|----------------------|----------|----------|
| `S3_ENDPOINT` | `http://localhost:8342` | endpoint S3 do R2 (`https://<conta>.r2.cloudflarestorage.com`) ou do SeaweedFS da VPS | API S3; o NAVEGADOR também acessa (envio direto) |
| `S3_REGIAO` | `us-east-1` | `auto` (R2) | região da assinatura |
| `S3_CHAVE` / `S3_SEGREDO` | credencial de DEV de `config/seaweedfs/s3.json` | token S3 do R2 com acesso só aos 3 buckets (segredo do provedor, nunca no repo) | credencial do app |
| `S3_FORCAR_CAMINHO` | `true` | `true` (R2 aceita) | `endpoint/bucket/chave` em vez de subdomínio por bucket |
| `S3_BUCKET_ARQUIVOS` | `lider-arquivos` | idem | capas, thumbs, materiais |
| `S3_BUCKET_VIDEOS_ORIGINAIS` | `lider-videos-originais` | idem | vídeo original enviado (passo 3b) |
| `S3_BUCKET_HLS` | `lider-hls` | idem | saída HLS do FFmpeg (passo 3b) |
| `S3_CORS_ORIGENS` | (opcional) | (opcional) | origens do CORS em `armazenamento:preparar`; sem ela: `BETTER_AUTH_URL` e `*.` do mesmo host |
| `REDIS_URL` | `redis://localhost:6382` | Redis da VPS backend | fila BullMQ do vídeo (passo 3b) |
| `REDIS_PORT` / `S3_PORT` | `6382` / `8342` | — | portas do host no `docker-compose` |

`next.config.ts` lê `S3_ENDPOINT` e `S3_BUCKET_ARQUIVOS` no build/arranque para o
`images.remotePatterns`: mudou o storage, reinicie o `next dev` / refaça o build.

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

## Video (pipeline HLS self-host)

Decisao em ADR-0005; especificacao em `docs/ARQUITETURA_VPS.md`; numeros em `docs/video-benchmark.md`;
regras RN-113 a RN-115.

```
admin (navegador) --multipart pre-assinado (16 MB/parte)--> bucket videosOriginais
  acaoIniciarEnvioVideo -> acaoAssinarPartesVideo (lotes) -> PUT das partes -> acaoConcluirEnvioVideo
  (HEAD confere o tamanho -> PROCESSANDO -> commit -> fila { videoId })
worker (npm run worker:video, outro processo) -> baixa o original -> FFmpeg HLS AES-128 + thumb
  -> sobe em hls/criadores/<criador>/videos/<id>/ -> evento video.pronto (duracao vai para a aula)
player -> acaoIniciarReproducao (sessao de reproducao + token 10 min) -> /api/video/<id>/hls/... e /chave
  renovacao a cada 4 min (acaoRenovarReproducao)
```

| Tabela | O que guarda |
|--------|--------------|
| `produtos_modulos_aulas_videos` | Um video vivo por aula: situacao (ENVIANDO/PROCESSANDO/PRONTO/FALHOU), original, multipart, prefixo HLS, chave cifrada, duracao, resolucoes, thumb, erro legivel |
| `produtos_modulos_aulas_videos_processamentos` | Cada tentativa do worker: situacao, tempos, CPU, cauda do log |
| `produtos_modulos_aulas_videos_sessoes` | Sessoes de reproducao (limite de telas, RN-115) |

| Action (`src/lib/actions/videos.ts`) | Quem | O que faz |
|--------|------|-----------|
| `acaoIniciarEnvioVideo` | DONO, ADMIN | Allowlist (MP4/MOV/MKV/WebM ate 10 GB), registro ENVIANDO, multipart aberto; `substituir: true` troca o video (antigo: soft delete + objetos apagados depois do commit) |
| `acaoAssinarPartesVideo` | DONO, ADMIN | URLs das partes (ate 50 por pedido, 1 h) |
| `acaoConcluirEnvioVideo` | DONO, ADMIN | Fecha o multipart, HEAD, PROCESSANDO, enfileira depois do commit (`enfileirado: false` = fila fora do ar) |
| `acaoCancelarEnvioVideo` | DONO, ADMIN | Aborta o multipart e exclui o registro |
| `acaoReprocessarVideo` | DONO, ADMIN | PROCESSANDO + fila (mesmo jobId: nunca duplica) |
| `acaoIniciarReproducao`, `acaoRenovarReproducao` | quem passa em `podeAssistir` | Abre/renova a sessao de reproducao e devolve o token |

| Rota | Conferencia | Resposta |
|------|-------------|----------|
| `GET /api/video/[id]/hls/[...caminho]` | playlist: token + sessao + video do host + `podeAssistir` + sessao de reproducao; segmento: token valido + host | playlist reescrita (`no-store`); segmento: 302 para URL assinada de 60 s |
| `GET /api/video/[id]/chave` | igual a playlist; recusa na trilha | 16 bytes, `no-store` |
| `GET /api/video/[id]/situacao` | sessao + DONO/ADMIN do host | JSON do estado (polling do editor) |

| Arquivo | O que faz |
|---------|-----------|
| `src/lib/video/provedor.ts` / `provedor-proprio.ts` | Interface `ProvedorVideo` e a implementacao self-host (envio, fila, token, eventos, situacao) |
| `src/lib/video/registro.ts` | Leitura do video e eventos do worker (idempotentes: so valem em PROCESSANDO) |
| `src/lib/video/entrega.ts` | Playlist, chave e segmento protegidos (os route handlers so repassam) |
| `src/lib/video/acesso.ts` / `acesso-aula.ts` | `podeAssistir` (RN-114, puro) e `acessoDaAula` (aula/modulo/produto + matricula valendo, para o token e a entrega) |
| `src/lib/video/sessoes.ts` / `reproducao.ts` | Limite de telas (puro) e sessoes de reproducao no banco |
| `src/lib/video/regras.ts` | Allowlist, partes do multipart, caminhos HLS aceitos (tela e servidor) |
| `src/lib/video/worker.ts` | Um job: baixa, processa, sobe, evento; erro legivel para a tela |
| `src/lib/video/ffmpeg.ts`, `processar.ts`, `segmento.ts` | Argumentos do FFmpeg, execucao (`spawn` sem shell, prioridade baixa, prazo), conferencia da cifra |
| `src/lib/video/chaves.ts`, `token.ts`, `playlist.ts` | Chave cifrada (AES-256-GCM, `v1:`), token HMAC, reescrita da playlist |
| `src/lib/video/fila.ts` | Fila BullMQ (payload `{ videoId }`, jobId = videoId, 3 tentativas, backoff, DLQ, prefixo) |
| `src/components/video/player-hls.tsx` | Player minimo (hls.js + `xhrSetup` com o token atual; HLS nativo sem MediaSource; marca d'agua) |
| `scripts/worker-video.ts` | Processo do worker (nunca dentro do Next), concorrencia 1 |

Variaveis de ambiente (documentar tambem no `.env.example`):

| Variavel | Quem usa | Formato |
|----------|----------|---------|
| `VIDEO_CHAVE_MESTRA` | app e worker | 32 bytes em base64 (`openssl rand -base64 32`). Sem ela o worker nao sobe. Trocar = rotacao (`v2:`), nunca sobrescrever |
| `VIDEO_SEGREDO_TOKEN` | app (e a borda que validar o token) | >= 32 caracteres aleatorios (`openssl rand -base64 32`) |
| `REDIS_URL` | app (enfileira) e worker (consome) | `redis://host:porta` |
| `VIDEO_FILA_PREFIXO` | app e worker | Prefixo das chaves da fila no Redis (padrao `li`; o teste usa `li-teste`) |
| `VIDEO_LIMITE_SESSOES` | app | Telas simultaneas por pessoa, 1 a 10 (padrao 2) |

Comandos:

```bash
npm run worker:video                                              # worker (outro terminal/container)
npx tsx scripts/video-gerar-teste.ts <pasta-fora-do-repo>          # videos sinteticos de teste
npx tsx scripts/video-benchmark.ts <pasta-fora-do-repo> [rotulo]   # mede e confere a saida
# Ponta a ponta REAL (FFmpeg + SeaweedFS + Redis + worker em processo separado), fora do npm test:
VIDEO_TESTE_REAL=1 npx vitest run --config config/vitest.config.mts --project integracao tests/integracao/video-pipeline.test.ts
VIDEO_TESTE_REAL=1 npx vitest run --config config/vitest.config.mts tests/video   # so o FFmpeg em disco local
```

`tests/integracao/video.test.ts` roda no `npm test` (precisa do storage no ar; sem ele, pula com aviso).
