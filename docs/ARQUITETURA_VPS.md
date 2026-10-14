# Vídeo hospedado na própria VPS (alternativa à seção 2 de ARQUITETURA.md)

Objetivo: o Valmer ser dono da stack de vídeo (storage + transcodificação + player + proteção) rodando em VPS, sem pagar por minuto a Mux/Cloudflare/Bunny.

## 1. Veredito (leia antes de construir)
1. **Não usar MinIO.** Pesquisa out/2026: o MinIO tirou recursos do console open source em mai/2025, parou de publicar binários/imagens em out/2025, entrou em "maintenance mode" em dez/2025 e o repositório foi **arquivado em abr/2026** (sem patches de segurança). O container `minio/minio:latest` ainda baixa, mas é uma versão de set/2025 sem manutenção. Para projeto novo, escolher:
   - **SeaweedFS** (Apache 2.0, Go, release frequente): melhor padrão para produção em 1 nó e para crescer.
   - **Garage** (AGPL, Rust, muito leve, ~1 GB RAM): bom para poucos nós; AGPL só importa se distribuir o software.
   - **RustFS** (Apache 2.0): substituto mais direto do MinIO, mais novo e com empresa comercial se formando.
   - Alternativa sem operar nada: **Cloudflare R2 / Backblaze B2** como origem (sem taxa de saída no R2), com a VPS só para o app e a transcodificação.
2. **O gargalo de self-host não é storage, é banda e CPU.** Uma VPS entrega vídeo com a banda dela (geralmente compartilhada, 1 Gbps no melhor caso, com franquia mensal) e longe de parte dos alunos. Sem CDN há buffering e a conta de tráfego estoura. **Obrigatório: colocar um CDN na frente** (Cloudflare, ou Bunny CDN pull zone), que busca os segmentos na VPS uma vez e serve do cache.
3. **Transcodificação consome CPU.** 1 hora de vídeo 1080p com escada de 3 resoluções pode levar de 1 a 3 horas de CPU em VPS pequena. Usar fila + worker separado (nunca no processo do site) e limitar a concorrência a 1–2 jobs.
4. **DRM real (Widevine/FairPlay) não existe self-host simples.** Self-host entrega **HLS com criptografia AES-128 + chave servida pela sua API + URLs assinadas + marca d'água dinâmica**. Isso barra download casual e compartilhamento de link, mas **não é DRM**: quem capturar a chave com sessão válida consegue baixar. Aceitável para a maioria dos cursos; se pirataria for crítica, usar provedor com DRM (ARQUITETURA.md, seção 2).
5. **Recomendação:** começar self-host **híbrido** (VPS + object storage + CDN) atrás da interface `VideoProvider` já prevista. Assim dá para trocar por Mux/Bunny depois sem reescrever o app. Se o time não quer operar infraestrutura de vídeo, a opção gerenciada mais barata (Bunny Stream) custa pouco e evita este trabalho.

## 2. Arquitetura
```
Aluno (navegador) ─► CDN (Cloudflare/Bunny) ─► Origem: VPS (Nginx → storage S3/arquivos HLS)
        │                                   ▲
        │ token curto + chave AES            │ segmentos .ts/.m4s + playlists .m3u8
        ▼                                   │
App Next.js (VPS) ── Postgres ── Redis ── Fila ── Worker FFmpeg (VPS ou VPS 2)
        │                                              │
        └─ Admin: upload direto (tus/S3 multipart) ────┘  grava HLS no storage e avisa o app
```
Componentes:
- **Storage**: SeaweedFS (S3 API) em volume dedicado, ou R2/B2. Buckets: `uploads-raw` (originais, privado, ciclo de vida 30–90 dias), `hls` (resultado), `assets` (PDFs, imagens, certificados).
- **Upload**: o admin envia o arquivo direto ao storage (upload multipart/tus com URL pré-assinada), retomável. O app cria `VideoAsset(status=UPLOADED)` e enfileira o job.
- **Worker de transcodificação** (container separado, `nice` baixo): FFmpeg gera HLS adaptativo + thumbnail + sprite de preview + duração; salva em `hls/<videoId>/`; atualiza `VideoAsset(status=READY, duracaoSeg, resolucoes)`; dispara notificação ao admin. Reprocessar com retry e log por tentativa.
- **Entrega**: Nginx na VPS (origem) serve `hls/` com cache e `Cache-Control` longo para segmentos e curto para playlists; CDN na frente com cache por caminho.
- **Proteção**: (a) segmentos criptografados AES-128; (b) a chave só sai de `GET /api/video/:id/key` com sessão válida + matrícula ativa + limite de sessões; (c) playlists e segmentos exigem **token assinado HMAC** com expiração de 5–10 min e amarrado ao usuário (`?t=<exp>.<hmac>`), validado pelo CDN (token auth do Bunny / regra WAF do Cloudflare) ou pelo Nginx (`secure_link`); (d) restrição de domínio/Referer; (e) marca d'água dinâmica no player (nome+e-mail, posição variável); (f) sem link direto para o original.

## 3. Pipeline FFmpeg (ponto de partida; validar em testes reais)
Escada sugerida (bitrates de vídeo; áudio AAC 128 kbps): 1080p ≈ 5 Mbps, 720p ≈ 2,8 Mbps, 480p ≈ 1,4 Mbps, 360p ≈ 0,8 Mbps. Segmentos de 6 s, GOP alinhado (2 s), `-sc_threshold 0`.
```bash
# key.info: linha 1 = URI da chave (a API), linha 2 = caminho local do arquivo da chave, linha 3 = IV (opcional)
ffmpeg -i input.mp4 \
  -filter_complex "[0:v]split=3[a][b][c];[a]scale=-2:1080[v1];[b]scale=-2:720[v2];[c]scale=-2:480[v3]" \
  -map "[v1]" -map "[v2]" -map "[v3]" -map a:0 -map a:0 -map a:0 \
  -c:v libx264 -preset veryfast -profile:v high -g 48 -keyint_min 48 -sc_threshold 0 \
  -b:v:0 5000k -maxrate:v:0 5350k -bufsize:v:0 7500k \
  -b:v:1 2800k -maxrate:v:1 3000k -bufsize:v:1 4200k \
  -b:v:2 1400k -maxrate:v:2 1500k -bufsize:v:2 2100k \
  -c:a aac -b:a 128k \
  -var_stream_map "v:0,a:0,name:1080p v:1,a:1,name:720p v:2,a:2,name:480p" \
  -f hls -hls_time 6 -hls_playlist_type vod -hls_flags independent_segments \
  -hls_key_info_file key.info -master_pl_name master.m3u8 \
  -hls_segment_filename "out/%v/seg_%05d.ts" "out/%v/index.m3u8"
```
- Gerar **uma chave aleatória de 16 bytes por vídeo**, guardada criptografada (KMS/segredo do app) na tabela `VideoAsset.chave`.
- Também gerar: `thumb.jpg`, sprite de preview da barra de progresso e `.vtt` de legendas (opcional: transcrição automática com Whisper no worker).
- Se a CPU for fraca, aceitar só 720p + 480p no início; 1080p quando houver necessidade. Codec H.264 por compatibilidade (AV1/HEVC não valem o custo de CPU agora).

## 4. Dimensionamento (fazer as contas com os números reais do Valmer)
- **Banda de pico** ≈ espectadores simultâneos × bitrate médio. 100 simultâneos × ~3 Mbps ≈ **300 Mbps**; 300 simultâneos ≈ 900 Mbps (já no limite de uma porta de 1 Gbps). Com CDN com bom cache, a origem recebe só uma fração (as primeiras requisições de cada segmento).
- **Tráfego mensal** ≈ horas assistidas × ~1,3 GB/h (a ~3 Mbps). 500 alunos × 10 h = 5.000 h ≈ **6,5 TB/mês**. Verificar a franquia da VPS: muitas têm 1–20 TB; exceder custa caro ou derruba a velocidade. É aqui que o CDN se paga.
- **Armazenamento**: ≈ 1,3 GB por hora de vídeo × escada completa (~2 GB/h com 4 níveis) + original. 100 h de conteúdo ≈ 200–300 GB. Planejar 3× como folga e backup externo.
- **CPU do worker**: 4 vCPU modernos transcodificam 1080p em ~1–2× o tempo real com `veryfast`. Se houver muitos uploads, subir um worker em máquina separada (pode ser sob demanda).
- **VPS mínima sugerida (produção pequena):** App + Postgres + Redis: 4 vCPU/8 GB. Worker + storage: 4–8 vCPU/16 GB e disco NVMe de 500 GB–1 TB, em **máquina separada do app** para o transcode não derrubar o site. Backups para object storage externo.

## 5. docker-compose (esqueleto do ambiente de produção)
```yaml
services:
  app:      { build: ./app, env_file: .env, depends_on: [db, redis], restart: always }
  worker:   { build: ./worker, env_file: .env, depends_on: [redis, storage], restart: always, deploy: { resources: { limits: { cpus: "3" } } } }
  db:       { image: postgres:17, volumes: [pgdata:/var/lib/postgresql/data], restart: always }
  redis:    { image: redis:7, restart: always }
  storage:  { image: chrislusf/seaweedfs, command: "server -s3 -dir=/data", volumes: [sw:/data], restart: always }   # S3 em :8333
  nginx:    { image: nginx:stable, ports: ["80:80","443:443"], depends_on: [app, storage], restart: always }          # origem do HLS + TLS
  caddy_or_traefik: opcional no lugar do nginx para TLS automático
volumes: { pgdata: {}, sw: {} }
```
Extras: firewall (só 80/443/SSH por chave), fail2ban, atualizações automáticas, backups diários do Postgres e do bucket `hls`+`assets` para destino externo (R2/B2) com teste de restauração, monitoração (Uptime Kuma, Prometheus/Grafana ou Netdata), alertas de disco/CPU/fila, rotação de logs.

## 6. Mudanças no modelo de dados e API
```
VideoAsset(id, lessonId, status[UPLOADED|PROCESSING|READY|FAILED], origemKey, hlsPrefix, chave (criptografada), duracaoSeg, resolucoes[], thumbUrl, spriteUrl, legendas[], tamanhoBytes, erro, criadoEm, processadoEm)
VideoJob(id, videoAssetId, tentativa, status, iniciadoEm, fimEm, log)
PlaybackSession(id, userId, lessonId, ip, userAgent, iniciadaEm, ultimoPingEm)   -- para limite de sessões simultâneas
```
- `POST /api/admin/videos/upload-url` (URL pré-assinada multipart) · `POST /api/admin/videos/:id/reprocess`
- `GET /api/lessons/:id/playback` → `{ masterUrl (assinada, 10 min), keyEndpoint, watermark:{texto}, resumeAt }` (valida matrícula/liberação)
- `GET /api/video/:id/key` → 16 bytes, exige cookie de sessão + `PlaybackSession` ativa, `Cache-Control: no-store`
- Renovação do token a cada ~4 min pelo player (sem interromper reprodução).
- Implementar `SelfHostedProvider` da interface `VideoProvider` (createUpload, getPlaybackToken, onWebhook→evento interno, getStatus).

## 7. Player para self-host
**hls.js** (ou Vidstack) com o visual do design. Configurar `xhrSetup` para anexar o token e tratar renovação; `withCredentials` para a rota da chave. Marca d'água em camada DOM sobreposta (e re-injetada se removida). Preload do próximo segmento, escolha automática de qualidade e opção manual. Safari/iOS toca HLS nativo; AES-128 funciona, mas a chave também precisa de cookie/token — testar em iPhone cedo.

## 8. Prós e contras
**Prós:** custo previsível (VPS + CDN), sem cobrança por minuto, controle total, dados no seu domínio, sem dependência de roadmap de terceiros.
**Contras:** você opera tudo (disco, backup, segurança, atualizações, fila); banda/CDN continua sendo custo real; sem DRM; analytics de qualidade de reprodução (buffering, abandono) precisa ser construída (enviar eventos do player ao PostHog/seu banco); equipe responsável por incidentes às 22h de um lançamento.

## 9. Quando escolher o quê
- **Poucos alunos, orçamento mínimo, quer controle:** self-host híbrido (esta doc) com SeaweedFS ou R2 + CDN.
- **Quer lançar rápido e dormir tranquilo:** Bunny Stream (barato) ou Mux (melhor analytics/DRM).
- **Pirataria é risco real:** provedor com DRM + marca d'água (VdoCipher, Gumlet, Kinescope, Mux, Bunny MediaCage).
Regra prática: se o tempo de quem vai operar vale mais que a economia, usar gerenciado.

## 10. Plano de implementação do módulo de vídeo self-host
1. Provisionar VPS (app) e VPS/volume (worker+storage); Docker, firewall, TLS, backups.
2. Subir SeaweedFS (ou configurar R2), buckets e credenciais; script de teste de upload/download.
3. Worker FFmpeg com fila: upload → HLS+chave → READY; teste com 5 vídeos reais e medir tempo/CPU.
4. Entrega: Nginx de origem, CDN com cache e token auth; teste de hotlink bloqueado e expiração.
5. API de playback + chave + sessões simultâneas; player hls.js com retomada e marca d'água.
6. Teste em Chrome, Safari/iOS, Android, rede 3G simulada; teste de carga (k6/artillery) com 200–300 simultâneos.
7. Monitoramento, alertas, restauração de backup testada. Só então migrar o conteúdo real.

## Fontes consultadas (pesquisa out/2026)
- pinggy.io/blog/minio_archived_self_hosted_s3_alternatives
- bex.co/blog/2026/07/09/minio-death-garage-seaweedfs-rustfs
- shipgarden.com (MinIO vs Garage vs SeaweedFS 2026)
- offshoreserverhosting.com (object storage self-hosted 2026)
- blog.elest.io (RustFS vs SeaweedFS vs Garage)
