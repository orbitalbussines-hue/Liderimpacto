# Projeto Easypanel `lideranca` (o mesmo da página de vendas) — serviços

Ficha de cada serviço da HML no Easypanel (ADR-0016). O passo a passo de clicar está em
`docs/deploy-easypanel.md`; as variáveis de cada um, em `env.exemplo` (nesta pasta).

Nomes: o Easypanel monta o host interno como `<projeto>_<serviço>` (ex.: `lideranca_li-db`), o mesmo
que o template oficial do SeaweedFS usa (`$(PROJECT_NAME)_<serviço>`). Confira na aba Credentials do
Postgres antes de colar as URLs.

Imagens do CI (GHCR, privadas): `ghcr.io/orbitalbussines-hue/liderimpacto-{app,worker,backup}:hml`. A
tag `hml` anda a cada deploy (o CI publica também a tag do SHA, usada para voltar versão).

## Ordem de criação

1. `li-db` → 2. `li-redis` → 3. `li-storage` → 4. `li-ferramentas` → 5. `li-app` → 6. `li-worker-certificados` →
7. `li-worker-video` → 8. `li-backup`. Banco, fila e storage precisam existir antes de quem usa.

## Tabela

| Serviço | Tipo / origem | Comando (Deploy > Command) | Volume | Domínio | CPU / memória (limite) |
|---|---|---|---|---|---|
| `li-db` | Postgres (do Easypanel), imagem `postgres:16.15`, banco `lider_impacto_hml` | — | do próprio serviço | nenhum (nunca Expose) | 1,5 vCPU / 2048 MB |
| `li-redis` | App, Source **Dockerfile** = conteúdo de `redis.Dockerfile` | — | `redis-dados` → `/data` | nenhum | 0,5 / 768 MB |
| `li-storage` | App, Source **Dockerfile** = conteúdo de `storage.Dockerfile` | — | `seaweed-dados` → `/data` | `s3.hml.liderdeimpacto.com.br` → porta **8333** | 1 / 1024 MB |
| `li-ferramentas` | App, Docker Image `...-worker:hml` | `node --import tsx scripts/db-migrar.ts && npm run -s armazenamento:preparar && exec sleep infinity` | — | nenhum | 0,5 / 512 MB |
| `li-app` | App, Docker Image `...-app:hml` | — (padrão da imagem: `node server.js`) | — | `hml.liderdeimpacto.com.br` e o mesmo com **Wildcard** → porta **3000** | 2 / 2048 MB |
| `li-worker-certificados` | App, Docker Image `...-worker:hml` | — (padrão da imagem) | — | nenhum | 0,5 / 768 MB |
| `li-worker-video` | App, Docker Image `...-worker:hml` | `node --conditions=react-server --import tsx scripts/worker-video.ts` | — | nenhum | **3** / 3072 MB |
| `li-backup` | App, Docker Image `...-backup:hml` | — (padrão: `backup agendar`) | — | nenhum | 0,5 / 1024 MB |

Em todos: reserva de CPU 0,1 e de memória 128 MB (o limite é o que protege a página de vendas).
Soma dos limites de memória ≈ 11 GB dos 32 GB da KVM 8. CPU: o worker de vídeo (3 vCPU, concorrência 1,
FFmpeg com prioridade baixa) é o único pesado; mesmo com app e banco no teto sobram vCPUs para a
página de vendas.

## Por serviço

**Comuns a `li-ferramentas`, `li-app` e workers**: credencial do registro na fonte Docker Image
(usuário GitHub + token clássico só `read:packages`); Deploy > **Zero downtime** ligado, **Tini**
ligado, **Replicas** 1, **Cap drop** `ALL`; Domains: apague o domínio automático do Easypanel se ele
criar um; Deployments: **Auto Deploy desligado** (quem dispara é o CI). Healthcheck: vem da imagem
(o Easypanel não tem campo; o Swarm usa o `HEALTHCHECK` do Dockerfile).

- **db** — criado pelo Easypanel com o superusuário `postgres` (senha gerada). Depois de criado, rode
  `banco-bootstrap.sql` no console psql (papéis `lider_migracao` dono e `lider_app` só dados). Aba
  Backups: destino R2 (ver runbook). Nunca publicar a porta.
- **redis** — senha em `REDIS_SENHA`. AOF + `noeviction` + `maxmemory 512mb` fixos no Dockerfile.
- **storage** — SeaweedFS 4.48 (igual ao dev). Credencial S3 em `S3_CHAVE`/`S3_SEGREDO`; o app usa a
  mesma. HTTPS no domínio; resolver `cloudflare` ou o padrão (o host não depende do curinga).
- **ferramentas** — migra o banco como DONO (com trava, pode subir em dobro sem erro), reaplica as
  permissões da app, prepara buckets + CORS e fica parado. Healthy só depois da migração
  (`SAUDE_ARQUIVO`). Seu Shell é onde se roda o seed do primeiro acesso. Única que tem a senha do dono.
- **app** — Next standalone, ouve `0.0.0.0:3000` (`HOSTNAME`/`PORT` já na imagem). Dois domínios:
  `hml.liderdeimpacto.com.br` (HTTPS, resolver `cloudflare`) e `hml.liderdeimpacto.com.br` com
  **Wildcard domain** ligado (resolver `cloudflare`): cobre `<slug>.hml...`. Saúde `/api/saude`:
  503 até o banco estar migrado, então a versão anterior segue no ar até a nova estar pronta.
- **worker-certificados** — filas certificados, eventos e conhecimento. Espera o schema em dia.
- **worker-video** — FFmpeg, concorrência 1, escada 720p + 480p (1080p fica para depois). Teto de 3
  vCPU. O Easypanel não expõe "tempo de parada": num deploy durante um transcode, o job é retomado
  pela fila (tentativa nova), sem perda.
- **backup** — todo dia às `BACKUP_HORA_UTC` copia o bucket `lider-arquivos` para o R2 (incremental);
  o banco é o backup do próprio Easypanel (`BACKUP_BANCO=0`). Shell: `backup agora` e
  `backup restaurar-teste`.

## Traefik (curinga)

Settings > Traefik > Environment: as linhas da seção `[traefik]` do `env.exemplo` (resolver
`cloudflare`, desafio DNS da Cloudflare, token em `CF_DNS_API_TOKEN`). Reiniciar o Traefik derruba
TODOS os sites da VPS por alguns segundos, inclusive a página de vendas: fazer fora do pico.
