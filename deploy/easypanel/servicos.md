# Projeto Easypanel `lideranca` — serviços da PRODUÇÃO

Ficha de cada serviço da produção no Easypanel (ADR-0016 e ADR-0017: produção direto, sem HML). O
passo a passo de clicar está em `docs/deploy-easypanel.md`; as variáveis de cada um, em `env.exemplo`
(nesta pasta). O projeto `lideranca` é só da plataforma (a página de vendas volta depois em outro
projeto).

Nomes: o Easypanel monta o host interno como `<projeto>_<serviço>` (ex.: `lideranca_li-db`). Confira na
aba Credentials de cada serviço antes de colar as URLs.

Imagens do CI (GHCR, privadas): `ghcr.io/orbitalbussines-hue/liderimpacto-{app,worker,backup}:prd`. A
tag `prd` anda a cada deploy (o CI publica também a tag do SHA, usada para voltar versão).

## Ordem

1. `li-db` → 2. `li-redis` → 3. `li-storage` (os três JÁ EXISTEM) → 4. `li-ferramentas` → 5. `li-app` →
6. `li-worker-certificados` → 7. `li-worker-video` → 8. `li-backup`.

## Tabela

| Serviço | Tipo / origem | Comando (Deploy > Command) | Volume | Domínio | CPU / memória (limite) |
|---|---|---|---|---|---|
| `li-db` | Postgres do Easypanel, `postgres:16.15`, banco `lider_impacto` | — | do próprio serviço | nenhum (nunca Expose) | 2 / 4096 MB |
| `li-redis` | Redis do Easypanel, `redis:7.4` | — | do próprio serviço | nenhum | 0,5 / 768 MB |
| `li-storage` | App, Source **Dockerfile** = conteúdo de `storage.Dockerfile` | — | `/data` | `s3.liderdeimpacto.com.br` → porta **8333** | 1 / 1024 MB |
| `li-ferramentas` | App, Docker Image `...-worker:prd` | `ferramentas` | — | nenhum | 0,5 / 768 MB |
| `li-app` | App, Docker Image `...-app:prd` | — (padrão da imagem: `node server.js`) | — | `liderdeimpacto.com.br`, `www.liderdeimpacto.com.br` e `liderdeimpacto.com.br` com **Wildcard** → porta **3000** | 2 / 3072 MB |
| `li-worker-certificados` | App, Docker Image `...-worker:prd` | — (padrão da imagem) | — | nenhum | 0,5 / 768 MB |
| `li-worker-video` | App, Docker Image `...-worker:prd` | `node --conditions=react-server --import tsx scripts/worker-video.ts` | — | nenhum | **3** / 3072 MB |
| `li-backup` | App, Docker Image `...-backup:prd` | — (padrão: `backup agendar`) | — | nenhum | 0,5 / 1024 MB |

Em todos: reserva de CPU 0,1 e de memória 128 MB. Soma dos limites de memória ≈ 14 GB dos 32 GB da
KVM 8: sobra para o Easypanel, o Traefik e a página de vendas quando ela voltar. O worker de vídeo (3
vCPU, concorrência 1, FFmpeg com prioridade baixa) é o único pesado.

## Por serviço

**Comuns a `li-ferramentas`, `li-app` e workers**: credencial do registro na fonte Docker Image
(usuário GitHub + token clássico só `read:packages`); Deploy > **Zero downtime** ligado, **Tini**
ligado, **Replicas** 1, **Cap drop** `ALL`; Domains: apague o domínio automático do Easypanel se ele
criar um; Deployments: **Auto Deploy desligado** (quem dispara é o CI). Healthcheck: vem da imagem
(o Easypanel não tem campo; o Swarm usa o `HEALTHCHECK` do Dockerfile, com 15 min de tolerância na
subida para esperar o backup + migração).

- **li-db** — já criado, com `banco-bootstrap.sql` rodado (papéis `lider_migracao` dono e `lider_app`
  só dados). Nunca publicar a porta. A aba Backups do Easypanel é opcional: o backup do banco é o do
  `li-backup` (diário/semanal) e o do `li-ferramentas` (antes de cada deploy).
- **li-redis** — já criado. URL interna na aba Credentials = `REDIS_URL`. A fila precisa de
  `maxmemory-policy noeviction` (padrão do Redis; o runbook confere).
- **li-storage** — já criado. SeaweedFS 4.48 (igual ao dev). Credencial S3 em `S3_CHAVE`/`S3_SEGREDO`;
  o app usa a mesma. HTTPS no domínio `s3.liderdeimpacto.com.br`, resolver `cloudflare`.
- **li-ferramentas** — a cada deploy (`deploy/easypanel/ferramentas.sh`): **backup do banco no R2**
  (`banco/pre-deploy/`) → migração como DONO (com trava) → marca da versão no banco → buckets + CORS →
  fica parado. Backup falhou = não migra, não libera a versão nova, tenta de novo em 5 min (a versão
  anterior segue no ar). Healthy só depois disso (`SAUDE_ARQUIVO`). Seu Shell é onde se roda o seed
  do primeiro acesso. Tem a senha do dono e o token do R2.
- **li-app** — Next standalone, ouve `0.0.0.0:3000`. Três domínios (HTTPS, resolver `cloudflare`):
  `liderdeimpacto.com.br`, `www.liderdeimpacto.com.br` (abre a mesma plataforma) e
  `liderdeimpacto.com.br` com **Wildcard domain** (cobre `<slug>.liderdeimpacto.com.br`). Saúde
  `/api/saude`: 503 até o banco estar migrado E a marca desta versão gravada (ou seja, depois do
  backup); a versão anterior segue no ar até lá.
- **li-worker-certificados** — filas certificados, eventos e conhecimento. Espera a marca da versão.
- **li-worker-video** — FFmpeg, concorrência 1, escada 720p + 480p. Teto de 3 vCPU. Num deploy
  durante um transcode, o job é retomado pela fila (tentativa nova), sem perda.
- **li-backup** — todo dia às `BACKUP_HORA_UTC`: copia `lider-arquivos` e `lider-videos-originais`
  para o R2 (incremental, nunca apaga lá) e faz o dump do banco (`BACKUP_BANCO=1`) em `banco/diario/`
  e, aos domingos, `banco/semanal/`. Shell: `backup agora` e `backup restaurar-teste [prefixo]`.

## Traefik (curinga)

Settings > Traefik > Environment: as linhas da seção `[traefik]` do `env.exemplo` (resolver
`cloudflare`, desafio DNS da Cloudflare, token em `CF_DNS_API_TOKEN`). Reiniciar o Traefik derruba
TODOS os sites da VPS por alguns segundos: fazer fora do pico.
