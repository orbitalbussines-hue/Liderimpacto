# ADR-0015: Homologação em 1 VPS com Docker Compose, Caddy (DNS-01 Cloudflare), SeaweedFS local e imagens no GHCR

- **Status**: Aceito — sem HML desde o ADR-0017 (produção direto no Easypanel, ADR-0016); este segue como referência para uma HML futura em VPS dedicada
- **Data**: 2026-10-14
- **Decisores**: Paulo (Bah! Tech)

## Contexto

O sistema precisa de um ambiente de homologação (HML) no ar para o Valmer validar antes da produção.
A regra da base (`CLAUDE.md`, "Infraestrutura") manda front e back em VPS separadas, com HML réplica
de PRD. Para a HML o Paulo decidiu gastar o mínimo e operar o mínimo: uma VPS só. O app é
multi-criador por subdomínio (ADR-0002), então precisa de DNS curinga e certificado curinga; o
upload vai direto do navegador ao storage S3 (ADR-0004); o vídeo é transcodificado por worker FFmpeg
(ADR-0005); há três filas leves (certificados, eventos, conhecimento) num segundo worker
(ADR-0008/0011/0014). O deploy antigo do workflow (git pull + `npm run build` + pm2 na VPS) compila no
servidor, não tem migração antes da troca nem verificação de saúde.

## Decisão

1. **Uma VPS Hostinger KVM (Ubuntu 24.04) com tudo em Docker Compose** (`deploy/hml/docker-compose.yml`):
   Caddy, app, `worker-video`, `worker-certificados`, PostgreSQL 16, Redis 7 e SeaweedFS. **Desvio
   CONSCIENTE da regra "front e back em VPS separadas", só para HML.** Mitigações: teto de CPU e
   memória por contêiner; o worker de vídeo com concorrência 1, FFmpeg com prioridade baixa e teto de
   1,25 vCPU (o site sempre tem sobra); `restart: unless-stopped` e healthcheck em tudo; logs com rotação.
2. **Redes**: só o Caddy publica porta (80/443). Postgres, Redis e SeaweedFS ficam numa rede
   `internal` (sem porta no host, sem saída para a internet). Redis com senha, AOF e `noeviction`.
3. **Borda = Caddy** com o módulo `caddy-dns/cloudflare` (imagem própria por xcaddy, versões fixadas):
   certificado **curinga** `*.hml.lideresdeimpacto.com.br` + apex por **DNS-01**, com token da Cloudflare
   só com `Zone:DNS:Edit` daquela zona, entregue SÓ ao contêiner do Caddy. DNS na Cloudflare em modo
   **DNS only** (nuvem cinza): o plano grátis não faz proxy de curinga de 2º nível, e sem proxy o
   `X-Real-IP` que o Caddy grava é o IP real (o app só confia nele, `src/lib/auth/ip.ts`). Cabeçalhos:
   HSTS 1 ano com subdomínios, `nosniff`, `Referrer-Policy` estrito, `X-Frame-Options: SAMEORIGIN` (a
   prévia do construtor é iframe da mesma origem, ADR-0010), `Permissions-Policy`. Fluxo (NDJSON do
   assistente) sem buffer.
4. **Storage = SeaweedFS na própria VPS**, em volume nomeado, publicado SÓ pela API S3 em
   `s3.hml.lideresdeimpacto.com.br` atrás do Caddy (limite de corpo 64 MB = maior PUT único 50 MB e
   partes de 16 MB). O navegador e também app/worker usam esse endpoint público (o cliente S3 é um só,
   ADR-0004): app e worker saem pelo IP público e voltam pelo Caddy. CORS restrito ao apex e `*.apex`
   pelo próprio bucket (`npm run armazenamento:preparar`, rodado a cada deploy). Slug `s3` reservado
   (`SLUGS_RESERVADOS`). A credencial S3 vem do `.env` e vira o `s3.json` em `/tmp` do contêiner.
5. **Imagens no GHCR** (`ghcr.io/orbitalbussines-hue/liderimpacto-{app,worker,caddy}:<sha>`), construídas
   no GitHub Actions (multi-stage, Node 24.12 = a do dev, usuário não-root, `npm ci`, sem segredo em
   camada):
   - **app**: Next em `output: "standalone"` (compatível com `cacheComponents`; o `next dev` não muda).
     O `next.config.ts` lê o host do storage NO BUILD (otimizador de imagens): o `S3_ENDPOINT` público é
     *build-arg* (não é segredo). O build usa segredo e URL de mentira só para compilar; conferido que
     nenhum valor de compilação vai para o HTML estático.
   - **worker**: dependências de produção + tsx + FFmpeg da distribuição (Debian trixie, 7.1). Uma
     imagem para os dois workers e para as ferramentas de deploy (migração, buckets, seed).
   - **caddy**: Caddy 2.11.7 + `caddy-dns/cloudflare` v0.2.4.
   A VPS entra no GHCR com o `GITHUB_TOKEN` do próprio job (stdin, `docker logout` no fim): nenhuma
   credencial de registro fica no servidor nem nos secrets.
6. **Deploy** (`deploy/hml/implantar.sh <sha>`, chamado pelo CI por SSH): pull → banco/Redis/storage/Caddy
   saudáveis → **migração** (`scripts/db-migrar.ts`, migrator do drizzle-orm, como dono do banco) →
   buckets/CORS → app e workers com `--wait` (healthcheck) → guarda versão atual e anterior e apaga as
   imagens mais velhas. O CI ainda confere de fora `GET https://hml.../api/saude` (DNS + TLS + app +
   banco). Rollback = `./implantar.sh "$(cat .tag-anterior)"`. Seed NUNCA no entrypoint.
7. **Três papéis no banco** (`deploy/hml/postgres-init.sh`, só na 1ª subida): `postgres` (superusuário,
   manutenção e `pg_dump`), `lider_migracao` (dono do banco; roda as migrações e cria a extensão
   `unaccent` da migração 0011 sem superusuário — ela é *trusted* no PG 13+) e `lider_app` (app e
   workers: só DML). A cada migração o script reaplica os GRANTs e **revoga UPDATE/DELETE/TRUNCATE**
   da `auditoria` e do razão `criadores_membros_pontos` (append-only).
8. **Saúde**: `GET /api/saude` → `{ ok }` (200/503, `no-store`, sem nenhum detalhe), fora do matcher do
   `proxy.ts` (o healthcheck chama por 127.0.0.1). Workers: PING no Redis da fila (`scripts/worker-saude.mjs`).
9. **Backup para o Cloudflare R2** (`deploy/hml/backup.sh`, cron diário): `pg_dump` no padrão da base
   (`--no-owner --no-acl --clean --if-exists`, `backup_DD_MM_YYYY_HH_MM.sql.gz`, conferido) em
   `banco/diario/` e, aos domingos, `banco/semanal/`; cópia incremental do bucket `lider-arquivos`
   (capas, materiais, legendas, PDFs de certificado). Retenção 30/90 dias por regra de ciclo de vida do
   bucket. Token R2 restrito ao bucket. rclone em contêiner (nada a instalar). Recusa rodar sem destino.
   **Vídeos ficam fora na HML**: são de teste, grandes, e o HLS é refeito do original.
   `restaurar-teste.sh` restaura o último dump num Postgres descartável e compara contagens.

## O que muda em produção

- **Separar** como manda a base: VPS do app (Caddy + app) e VPS de backend (Postgres, Redis, workers),
  ou ao menos o worker de vídeo numa máquina própria; storage em **R2** (sem taxa de saída) ou
  SeaweedFS em volume dedicado, com CDN na frente do HLS (`docs/ARQUITETURA_VPS.md`).
- Domínio `lideresdeimpacto.com.br`: o apex vira a plataforma e o site institucional precisa de outro
  host (ou o proxy da Cloudflare passa a valer para o 1º nível, ajustando `src/lib/auth/ip.ts` para o
  cabeçalho da CDN).
- Backup de vídeos originais (ou storage já externo), retenção de PRD e o job `deploy-prd` reescrito
  no modelo de imagens (hoje é o esqueleto da base, com o backup antes).
- `NODE_ENV=production` e as mesmas travas já valem na HML; em PRD, SMTP ligado (link por e-mail).

## Alternativas Consideradas

- **Duas VPS já na HML** (regra da base): dobra custo e operação para um ambiente de validação com
  poucos usuários. Fica para PRD.
- **Build na VPS (git pull + npm ci + next build + pm2)**, o deploy antigo: compila no servidor que
  atende (CPU e memória do site), não é reproduzível e não volta de versão com um comando.
- **Proxy da Cloudflare (nuvem laranja)**: o plano grátis não cobre `*.hml` (curinga de 2º nível) e
  esconderia o IP real atrás de um cabeçalho que o app teria de passar a confiar.
- **HTTP-01 por subdomínio (on-demand TLS)**: um certificado por criador, rate limit da Let's Encrypt e
  endpoint de autorização a manter; o curinga por DNS-01 é um certificado só.
- **R2 já na HML para os arquivos**: seria o mesmo código (só env), mas a decisão foi a HML igual ao
  dev (SeaweedFS local); o R2 entra só como destino de backup e fica como opção para PRD.
- **PAT do GHCR gravado na VPS**: credencial de longa duração no servidor; o token do job expira sozinho.
- **Endpoint S3 interno para app/worker** (`http://storage:8333`) e público só para o navegador: o
  cliente S3 é um só e assina com o host que usa; separar exigiria dois clientes. A volta pelo Caddy
  custa uma conexão TLS a mais, irrelevante na HML.

## Consequencias

### Positivas
- Deploy reproduzível (a mesma imagem testada vai para a VPS), migração antes da troca, saúde
  conferida por dentro e por fora, rollback com um comando.
- Nenhum segredo no repositório, nas imagens ou nos secrets do GitHub além da chave SSH do deploy.
- Banco com privilégio mínimo para a app; trilha e razão de pontos protegidos no próprio banco.

### Negativas / Trade-offs
- Um ponto único de falha: a VPS caiu, a HML inteira caiu (aceitável para homologação).
- Transcode longo divide a máquina com o site (mitigado pelos tetos de CPU e pela prioridade baixa).
- Migração só anda para a frente: voltar de versão com migração nova exige que o código antigo
  aceite o schema novo (migrações aditivas) ou restore do backup.
- O `S3_ENDPOINT` público entra no build do app: trocar o host do storage pede imagem nova.

### Neutras
- O CI passou a fixar Node 24.12.0 (a do dev): o npm 11.19+ recusa este lockfile (`@emnapi/*`).
