# ADR-0016: Homologação no Easypanel compartilhado com a página de vendas

- **Status**: Aceito
- **Data**: 2026-10-16
- **Decisores**: Paulo (Bah! Tech)

## Contexto

O ADR-0015 desenhou a HML numa VPS crua (Docker Compose + Caddy + deploy por SSH). O Paulo mudou o
plano: a HML vai para o **Easypanel que já roda na VPS da página de vendas do Valmer** (Hostinger
KVM 8: 8 vCPU, 32 GB de RAM, 400 GB NVMe). Outro projeto vive ali e não pode cair nem ficar lento.
Domínios: `hml.liderdeimpacto.com.br`, `<slug>.hml.liderdeimpacto.com.br` (criadores) e
`s3.hml.liderdeimpacto.com.br` (storage). DNS na Cloudflare.

O que a documentação oficial do Easypanel confirma (consultada em 16/10/2026) e pesou na decisão:

- **App service** ([services/app](https://easypanel.io/docs/services/app)): origem GitHub, Git,
  imagem Docker (com usuário/senha para registro privado), Dockerfile inline ou upload; command
  override, réplicas, *zero-downtime*, Tini, cap add/drop; volume/bind/file mounts; limites e reservas
  de CPU (núcleos) e memória (MB); **Deployment Trigger URL** com segredo e Auto Deploy por push do
  GitHub; Logs e Shell por serviço. **Não tem campo de healthcheck nem "voltar versão"**, e não há job
  de pré-deploy. O serviço roda no Docker Swarm (a API do Easypanel fala em "Docker Swarm cluster",
  [api/endpoints](https://easypanel.io/docs/api/endpoints)), que usa o `HEALTHCHECK` da imagem.
- **Builders** ([builders](https://easypanel.io/docs/builders)): Dockerfile em caminho customizado,
  contexto = Build Path; as variáveis do serviço chegam ao build **como build-arg** (precisa `ARG`).
- **Postgres** ([services/postgres](https://easypanel.io/docs/services/postgres)): imagem escolhida na
  criação, usuário `postgres`, banco com o nome escolhido, console psql; aba **Backups** com
  `pg_dump` (custom + gzip), cron, retenção por quantidade e Restore
  ([backups/database](https://easypanel.io/docs/backups/database)) para um Storage Provider S3
  compatível com **preset do Cloudflare R2** ([storage-providers/s3](https://easypanel.io/docs/storage-providers/s3)).
  Ressalva da doc: "Automatic runs also require a license that includes scheduled database backups".
- **Redis** ([services/redis](https://easypanel.io/docs/services/redis)): imagem oficial, sem como
  configurar AOF/`noeviction` documentado e sem backup.
- **Volume backups** ([backups/volumes](https://easypanel.io/docs/backups/volumes)): `rclone sync`
  espelho (apaga no destino o que sumiu na origem), sem histórico nem botão de restore.
- **Compose service** ([services/compose](https://easypanel.io/docs/services/compose)): `docker compose
  up --build -d`, sem healthcheck/limites geridos pelo painel; sinaliza `ports`/`container_name`.
- **Curinga** ([guides/wildcard-domain](https://easypanel.io/docs/guides/wildcard-domain)): resolver
  ACME por variáveis `TRAEFIK_CERTIFICATESRESOLVERS_<NOME>_*` em Settings > Traefik > Environment,
  credencial do provedor DNS no formato do Traefik/lego (Cloudflare: `CF_DNS_API_TOKEN`, que pede
  Zone:Read + DNS:Edit, [lego](https://go-acme.github.io/lego/dns/cloudflare/)), restart do Traefik e,
  no domínio, "Wildcard domain" + nome do resolver; raiz e curinga são dois domínios.
- **Planos** ([pricing](https://easypanel.io/pricing)): o Free vai até 3 projetos.

## Decisão

1. **Serviços App separados, com prefixo `li-`, dentro do projeto `lideranca` da página de vendas** (decisão do Paulo em 17/10: não criar projeto novo; o `db` e o `site` da página não são tocados), não um Compose service: só o App tem
   limites de CPU/memória, zero-downtime, Trigger URL e Shell por serviço no painel; num VPS
   compartilhado o limite por serviço é a proteção da página de vendas. Ficha:
   `deploy/easypanel/servicos.md`; variáveis: `deploy/easypanel/env.exemplo`.
2. **Imagens construídas no CI** (GHCR, tag do SHA + tag móvel `hml`); os serviços usam a fonte
   Docker Image. O build do Next nunca roda na VPS que atende a página de vendas. O `S3_ENDPOINT`
   público continua build-arg do CI (se um dia o Easypanel construir do GitHub, a doc garante que a
   variável chega como build-arg). Credencial do GHCR no Easypanel = token clássico só `read:packages`.
3. **Deploy só depois do CI verde**: o job `deploy-hml` chama a Deployment Trigger URL de cada
   serviço (`deploy/easypanel/disparar-deploy.sh`, secrets `EASYPANEL_DEPLOY_WEBHOOK_*`). Auto Deploy
   desligado. Voltar versão = job `voltar-hml` (repõe a tag `hml` num SHA anterior e dispara).
   O job de SSH + compose saiu do CI (ficaria morto, ninguém liga dois deploys automáticos para o
   mesmo ambiente); `deploy/hml/` continua válido para VPS dedicada, à mão, porque o CI segue
   publicando `app`/`worker`/`caddy` com a tag do SHA.
4. **Migração sem job de pré-deploy**: o serviço `ferramentas` (imagem worker, ÚNICO com a senha do
   dono) roda `scripts/db-migrar.ts` no início, com **`pg_advisory_lock`** numa conexão dedicada (dois
   contêineres ao mesmo tempo: o segundo espera e não acha nada a aplicar), reaplica os GRANTs, prepara
   buckets/CORS e fica parado; healthy só depois (`SAUDE_ARQUIVO`). O **`/api/saude` responde 503
   até o banco ter todas as migrações do código** (`src/lib/db/migracoes.ts`, compara o journal com
   `drizzle.__drizzle_migrations`) e os workers esperam (`aguardarEsquema`). Com zero-downtime, a
   versão anterior atende até a nova ficar saudável. O app nunca recebe a senha do dono.
5. **Healthcheck na imagem** (`HEALTHCHECK` no app, worker, e nos Dockerfiles inline de Redis e
   storage). Redis e SeaweedFS são App com **Dockerfile inline** (`deploy/easypanel/redis.Dockerfile`,
   `storage.Dockerfile`): AOF + `noeviction` + senha, e credencial S3 por variável. Postgres é o do
   Easypanel (`postgres:16.15`), com os papéis criados à mão por `deploy/easypanel/banco-bootstrap.sql`.
6. **Borda = Traefik do Easypanel** com resolver `cloudflare` (DNS-01) para o curinga. Registros
   `hml`, `*.hml` e `s3.hml` em **DNS only**: o SSL grátis da Cloudflare não cobre curinga de 2º
   nível, sem proxy o IP real chega ao app, e o próprio suporte do Easypanel manda usar DNS only quando
   a renovação falha. O Traefik remove `X-Real-Ip` vindo de fora e grava o do cliente (o app só lê
   esse, `src/lib/auth/ip.ts`); o runbook confere. Os cabeçalhos de segurança que eram do Caddy
   passaram para o `next.config.ts` (`headers()`, `poweredByHeader: false`).
7. **Backup no R2**: banco pelo backup do Easypanel (diário 30 cópias, semanal 13, prefixos
   separados); arquivos pelo serviço `backup` (`deploy/easypanel/backup.sh`: `rclone copy` incremental
   de `lider-arquivos`, nunca apaga no destino). Plano B se a licença não agendar: `BACKUP_BANCO=1`
   faz o `pg_dump` no padrão da base. `backup restaurar-teste` restaura o último dump (formato do
   Easypanel ou do script) num Postgres descartável dentro do contêiner e compara contagens. Vídeos
   continuam fora (ADR-0015).
8. **Dimensionamento para dividir a VPS**: worker de vídeo com teto de 3 vCPU, concorrência 1, FFmpeg
   com prioridade baixa e escada 720p + 480p; app 2 vCPU; banco 1,5; demais ≤ 1. Soma dos limites de
   memória ≈ 11 GB de 32 GB.

## O que muda em relação ao ADR-0015

| Tema | ADR-0015 (VPS crua) | ADR-0016 (Easypanel) |
|---|---|---|
| Borda/certificado | Caddy próprio + DNS-01 | Traefik do Easypanel + resolver DNS-01 |
| Deploy | SSH + `implantar.sh` | Trigger URL por serviço, depois do CI |
| Migração | passo do script antes da troca | serviço `ferramentas` com trava + saúde 503 |
| Rollback | `implantar.sh <tag anterior>` | job `voltar-hml` (tag `hml` num SHA anterior) |
| Redes | rede `internal` sem saída | rede do projeto no Easypanel (sem porta publicada) |
| Backup do banco | `backup.sh` + cron | aba Backups do Easypanel (plano B no serviço `backup`) |
| Credencial GHCR | token do job, temporário | token `read:packages` guardado no Easypanel |

## Riscos de dividir a VPS com a página de vendas

- **Ruído de vizinho**: transcode longo e picos do app disputam CPU, disco e rede com a página de
  vendas. Mitigação: limites por serviço, FFmpeg nice, concorrência 1; o build não roda ali.
- **Raio de explosão do Traefik**: mexer em Settings > Traefik (resolver, restart) derruba todos os
  sites por segundos; erro de configuração pode derrubar mais. Mexer fora do pico.
- **Painel único**: quem tem acesso ao Easypanel administra os dois projetos; os segredos da HML moram
  na mesma base de configuração. Acesso ao painel só do Paulo, com senha forte e 2FA se houver.
- **Disco**: vídeos de teste enchem o NVMe compartilhado; conferir espaço livre no Easypanel.
- **Prioridade de host no Traefik**: a doc não diz a prioridade entre o curinga `*.hml` e o host
  `s3.hml`. Se o curinga ganhar, o storage cai no app; o runbook confere e dá a saída
  (`HML_S3_ENDPOINT` com um host fora do curinga).
- **Licença**: Free = 3 projetos e o backup agendado do banco pode exigir licença (plano B pronto).

## Quando separar

Antes de PRD (ADR-0015, "O que muda em produção") ou já na HML se: a página de vendas ficar lenta
durante transcode; uso de CPU da VPS acima de ~70% por períodos longos; disco livre abaixo de 25%;
mais de um criador subindo vídeo com frequência; ou necessidade de dar acesso ao painel a outra
pessoa. Separar = projeto `lider-impacto` noutra VPS (Easypanel ou compose do ADR-0015) com as mesmas
imagens.

## Alternativas Consideradas

- **Compose service do Easypanel com o `deploy/hml/docker-compose.yml`**: reaproveitaria o arquivo,
  mas o Easypanel faz `docker compose up --build -d` sem limites/healthcheck geridos pelo painel, sem
  zero-downtime nem Trigger por serviço, e sinaliza `ports`; o Caddy disputaria 80/443 com o Traefik.
- **Fonte GitHub com build no Easypanel**: funciona (Dockerfile customizado, build-arg chega), mas
  compila o Next na VPS da página de vendas a cada deploy e faz o auto-deploy cego, sem o CI.
- **Migração no comando de início do app**: o app (exposto à internet) passaria a ter a senha do dono.
- **Migração no `worker-certificados`**: mesmo problema, num processo que lê conteúdo dos usuários.
- **Redis/Postgres "gerenciados" para tudo**: o Postgres sim (backup); o Redis não documenta AOF nem
  `noeviction`.
- **Backup de volume do Easypanel para os arquivos**: espelho que apaga no destino, inclui os vídeos
  e copia arquivos internos do SeaweedFS em uso; sem restore pela tela.
- **API do Easypanel no CI (trocar a tag por chamada)**: o token da API administra o painel inteiro,
  inclusive a página de vendas; a Trigger URL só dispara o deploy de um serviço.

## Consequencias

### Positivas
- Nenhum deploy sem CI verde; nada compila na VPS compartilhada; mesma imagem testada vai ao ar.
- A versão nova só entra no ar com o banco migrado; migração segura com contêiner em dobro.
- Papéis do banco, append-only e saúde iguais ao ADR-0015.

### Negativas / Trade-offs
- Token `read:packages` de longa duração guardado no Easypanel.
- A conferência do CI vê "site no ar", não "versão nova no ar" (a troca se vê em Deployments).
- O Easypanel não expõe tempo de parada: deploy durante transcode reinicia o job (a fila retoma).
- Configuração clicada no painel (não versionada); a ficha `deploy/easypanel/servicos.md` é a fonte.

### Neutras
- `deploy/hml/` (compose) segue funcionando com o mesmo código: a trava e a saúde por versão do
  schema não mudam o fluxo dele.
