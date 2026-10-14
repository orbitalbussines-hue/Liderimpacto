# ADR-0005: Vídeo self-host (HLS AES-128) com entrega protegida pelo app

- **Status**: Aceito
- **Data**: 2026-10-14
- **Decisores**: Paulo (Bah! Tech)

## Contexto

`docs/ARQUITETURA_VPS.md` define o vídeo self-host: original no storage S3, worker FFmpeg separado
do site, HLS com segmentos cifrados (AES-128), chave por vídeo, token HMAC curto amarrado à pessoa
e marca d'água. Falta decidir QUEM confere o token e entrega playlist, chave e segmentos agora
(antes de existir Nginx/CDN na frente) e como fica a interface `VideoProvider` de
`docs/ARQUITETURA.md` §2. Números do pipeline em `docs/video-benchmark.md`.

## Decisão

1. **Interface `ProvedorVideo`** (`src/lib/video/provedor.ts`) com uma implementação,
   `ProvedorProprio`: `criarEnvio`, `concluirEnvio`, `tokenDeReproducao`, `aoReceberEvento`,
   `situacao`. Todo método recebe o criador do HOST. Trocar por Mux/Bunny = outra implementação;
   as telas e as rotas não mudam.
2. **Envio**: multipart S3 pré-assinado direto do navegador ao bucket `videosOriginais`, em partes
   de 16 MB (URLs pedidas em lotes, 1 h). O `upload_id` mora no banco, nunca vem da tela. Concluir
   = `CompleteMultipartUpload` + HEAD (tamanho) + `PROCESSANDO` na transação; a fila (BullMQ,
   payload só `{ videoId }`, `jobId = videoId`) recebe o job DEPOIS do commit.
3. **Worker** em processo separado (`npm run worker:video`, concorrência 1, FFmpeg com prioridade
   baixa): baixa o original por stream para disco, gera HLS, sobe em
   `hls/criadores/<criador>/videos/<id>/` e manda o evento interno `video.pronto` (ou
   `video.falhou`). Eventos são idempotentes: só valem para vídeo vivo em PROCESSANDO.
4. **Entrega pelo app nesta fase** (`src/lib/video/entrega.ts`, route handlers em `/api/video/[id]`):
   - **playlist** (`hls/master.m3u8`, `hls/<degrau>/index.m3u8`): conferência COMPLETA (token +
     sessão de login do host da mesma pessoa + vídeo vivo do criador + `podeAssistir` + sessão de
     reprodução viva) e resposta reescrita com o token, `no-store`;
   - **chave** (`/chave`): a mesma conferência; 16 bytes, `no-store`; recusa vai para a trilha;
   - **segmento**: com token VÁLIDO, só HMAC + host (sem banco) e **302 para URL assinada de 60 s**
     no storage. O Next não carrega bytes de vídeo. Com token VENCIDO (o player nativo do Safari não
     troca o token embutido na playlist VOD), só com a conferência completa.
5. **Token** `<exp>.<payload>.<mac>` (HMAC-SHA256, 10 min), payload = vídeo + criador + pessoa +
   sessão de reprodução. Token de outro criador = 404 (o vídeo "não existe" naquele host).
6. **Sessões de reprodução** no banco (limite de 2 telas, RN-115): abrir trava as sessões da pessoa
   (advisory lock) e encerra as mais antigas; renovar a cada 4 min mantém a sessão viva.
7. **Chave por vídeo** cifrada com AES-256-GCM (`VIDEO_CHAVE_MESTRA`, formato `v1:`, AAD = id do
   vídeo). Só decifrada no worker (para cifrar os segmentos) e na rota da chave.

## Alternativas Consideradas

- **Proxy dos segmentos pelo Next**: mais simples para CORS, mas toda a banda de vídeo passaria pelo
  processo do site (CPU, memória, banda da VPS do app). Recusado; o 302 custa uma ida a mais por
  segmento de 6 s.
- **Conferência completa em todo segmento**: uma sessão de login + 3 consultas a cada 6 s por
  pessoa assistindo. O token assinado já amarra pessoa e vídeo; a sessão é conferida na playlist,
  na chave e na renovação.
- **Validar o token já na borda (Nginx `secure_link` / token do CDN)**: é o destino (ver abaixo),
  mas não há borda em dev nem na VPS ainda. O `secure_link` do Nginx usa MD5 e não serve para este
  HMAC: será `auth_request` para a rota do app ou a regra de token do CDN (Bunny/Cloudflare).
- **Mux/Bunny Stream**: continuam possíveis atrás da mesma interface (ARQUITETURA.md §2).
- **DRM (Widevine/FairPlay)**: não existe self-host simples; AES-128 + token + marca d'água barra o
  download casual, não é DRM (ARQUITETURA_VPS.md §1).

## Consequencias

### Positivas
- Mesmo código em dev e produção; trocar SeaweedFS por R2 é só env. O app nunca serve bytes de vídeo.
- Link copiado não funciona para outra pessoa (sem o cookie dela a playlist e a chave recusam).
- Vídeo de A nunca abre no host de B: token com criador + filtro do host + chave do storage com prefixo.

### Negativas / Trade-offs
- Quem tem sessão válida consegue capturar a chave (não é DRM).
- Segmento com token válido não confere a sessão a cada pedido: uma sessão encerrada pelo limite
  ainda baixa segmentos cifrados até o token vencer (no máximo 10 min), mas sem a chave.
- Mesmo IV em todos os segmentos de um vídeo (comportamento do FFmpeg em VOD).
- Objetos órfãos se a limpeza depois do commit falhar (log CRITICAL; falta o job de varredura).
- Tentativa de worker que morre no meio fica PROCESSANDO no log de tentativas (a fila refaz o job).
- Com CDN na frente: reprocessar regrava os mesmos nomes de segmento; purgar a pasta do vídeo.

### Neutras
- Quando entrar Nginx/CDN: a borda valida o token do segmento (HMAC) e serve do cache; playlist e
  chave continuam no app. A interface e o formato do token não mudam.
- O ALUNO entra no passo 4 só mudando `podeAssistir` (matrícula + liberação).
