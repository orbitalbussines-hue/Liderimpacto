# Deploy da homologação no Easypanel — passo a passo

A HML roda no **Easypanel da VPS da página de vendas do Valmer** (decisão e porquês no ADR-0016).
A página de vendas continua lá e **não pode cair**: os passos que mexem nela estão marcados com **ATENÇÃO**.

| O quê | Endereço |
|-------|----------|
| Plataforma (SUPER_ADMIN) | `https://hml.liderdeimpacto.com.br` |
| Área de cada criador | `https://<slug>.hml.liderdeimpacto.com.br` (Valmer: `lider-de-impacto`) |
| Storage (envio direto do navegador) | `https://s3.hml.liderdeimpacto.com.br` |

Arquivos de apoio: `deploy/easypanel/servicos.md` (ficha de cada serviço), `deploy/easypanel/env.exemplo`
(variáveis de cada serviço e como gerar os segredos), `deploy/easypanel/banco-bootstrap.sql`,
`deploy/easypanel/redis.Dockerfile`, `deploy/easypanel/storage.Dockerfile`.

## Como o deploy funciona (depois de pronto)

1. Você faz push na `develop`.
2. O GitHub Actions roda o CI (auditor, lint, tipos, testes, build). Só se passar:
3. constrói as imagens (app, worker, backup) **no GitHub, não na VPS**, e publica com a tag `hml`;
4. chama o "Deployment Trigger" de cada serviço no Easypanel: primeiro `li-ferramentas` (migra o banco),
   depois app, workers e backup;
5. o Easypanel baixa a imagem nova e só troca a versão quando ela fica saudável. O app responde
   "não pronto" até o banco estar migrado, então a versão anterior segue no ar até lá;
6. o CI confere `https://hml.liderdeimpacto.com.br/api/saude`.

O "Auto Deploy" do Easypanel fica **desligado**: nada vai ao ar sem o CI verde.

---

## Antes de começar: a VPS aguenta?

A VPS é uma Hostinger KVM 8 (8 vCPU, 32 GB de RAM, 400 GB NVMe): sobra folga. Só confira:

1. Easypanel > **Monitor** (ou o painel inicial do servidor): CPU e memória de agora. Precisa ter
   pelo menos **12 GB de RAM livres** e CPU média abaixo de 50%.
2. No mesmo lugar, **disco livre: pelo menos 80 GB** (vídeos de teste ocupam espaço; o original e o
   HLS ficam no disco da VPS).
3. A plataforma entra no projeto **`lideranca`**, o mesmo da página de vendas (não cria projeto novo,
   então o limite de 3 projetos do plano Free não pesa).

Se algum número estiver apertado, pare e avise antes de criar os serviços.

---

## Passo 1 — Token da Cloudflare para o certificado curinga

Cloudflare > ícone do perfil > **My Profile** > **API Tokens** > **Create Token** > **Create Custom Token**:

- **Token name**: `easypanel-traefik-liderdeimpacto`
- **Permissions** (duas linhas): `Zone` · `Zone` · `Read` e `Zone` · `DNS` · `Edit`
  (o Traefik precisa ler a zona para achar o id dela antes de editar o DNS)
- **Zone Resources**: `Include` · `Specific zone` · `liderdeimpacto.com.br`
- **Client IP Address Filtering** (recomendado): `Is in` · o IP da VPS
- **TTL**: sem data de fim

Continue > Create Token > **copie o token** (aparece uma vez) e guarde no gerenciador de senhas.

## Passo 2 — Registros DNS da HML

Cloudflare > `liderdeimpacto.com.br` > **DNS** > **Records** > **Add record** (três vezes):

| Type | Name | IPv4 | Proxy status |
|------|------|------|--------------|
| A | `hml` | IP da VPS | **DNS only** (nuvem CINZA) |
| A | `*.hml` | IP da VPS | **DNS only** (nuvem CINZA) |
| A | `s3.hml` | IP da VPS | **DNS only** (nuvem CINZA) |

Por que nuvem cinza: o certificado grátis da Cloudflare não cobre `*.hml` (curinga de 2º nível), o app
precisa ver o IP real de quem acessa, e o próprio suporte do Easypanel manda usar "DNS only" quando o
certificado não renova. **Não mude o modo SSL/TLS da zona** (vale para os outros registros do domínio).

Confira (PowerShell): `Resolve-DnsName teste.hml.liderdeimpacto.com.br` → IP da VPS.

## Passo 3 — ATENÇÃO: resolver curinga no Traefik do Easypanel

**Faça fora do horário de pico da página de vendas** (de madrugada): reiniciar o Traefik derruba
TODOS os sites da VPS por alguns segundos.

1. Easypanel > **Settings** > **Traefik** > **Environment**.
2. Descubra o e-mail que o Easypanel já usa para o Let's Encrypt (Settings; é o mesmo para todos os
   resolvers, a doc do Easypanel exige isso).
3. Acrescente (sem apagar o que já existe) as linhas da seção `[traefik]` de `deploy/easypanel/env.exemplo`,
   trocando o e-mail e colando o token do passo 1 em `CF_DNS_API_TOKEN`:
   ```
   TRAEFIK_CERTIFICATESRESOLVERS_CLOUDFLARE_ACME_EMAIL=...
   TRAEFIK_CERTIFICATESRESOLVERS_CLOUDFLARE_ACME_STORAGE="/data/acme.json"
   TRAEFIK_CERTIFICATESRESOLVERS_CLOUDFLARE_ACME_DNSCHALLENGE_PROVIDER=cloudflare
   TRAEFIK_CERTIFICATESRESOLVERS_CLOUDFLARE_ACME_DNSCHALLENGE_RESOLVERS=1.1.1.1,8.8.8.8
   CF_DNS_API_TOKEN=...
   ```
4. Salve e clique em **Restart** (Traefik). Abra a página de vendas logo em seguida: tem que voltar
   em segundos. Não voltou? Apague as linhas novas, salve, Restart de novo, e me avise.

O nome do resolver nos domínios (passo 6) é `cloudflare`, em minúsculas.

## Passo 4 — Token do GitHub para o Easypanel baixar as imagens

As imagens ficam no registro privado do GitHub (GHCR). O Easypanel precisa de um token só de leitura:

GitHub > foto > **Settings** > **Developer settings** > **Personal access tokens** > **Tokens (classic)**
> **Generate new token (classic)**: nota `easypanel-hml-ghcr`, expiração 1 ano (anote para renovar),
marque **só** `read:packages`. Gere e guarde no gerenciador de senhas.

(Os tokens "fine-grained" não servem para o GHCR. Este token só lê pacotes; não mexe em código.)

## Passo 5 — Gerar os segredos

No Git Bash (o `openssl` vem com o Git), gere cada valor e cole no seu gerenciador de senhas com o
nome ao lado. A lista completa e onde cada um vai está em `deploy/easypanel/env.exemplo`:

```bash
for n in DB_MIGRACAO_SENHA DB_APP_SENHA REDIS_SENHA S3_SEGREDO; do echo "$n=$(openssl rand -hex 32)"; done
echo "S3_CHAVE=$(openssl rand -hex 16)"
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
for n in VIDEO_CHAVE_MESTRA VIDEO_SEGREDO_TOKEN; do echo "$n=$(openssl rand -base64 32)"; done
```

**Guarde tudo no gerenciador de senhas.** Sem a `VIDEO_CHAVE_MESTRA` nenhum vídeo processado volta a
tocar; nunca troque ela depois (exige rotação, `docs/back.md`).

## Passo 6 — Criar o projeto e os serviços (nesta ordem)

**Não crie projeto novo:** use o projeto **`lideranca`**. Ele já tem o `db` e o `site` da página de
vendas: **NUNCA mexa neles** (nem variável, nem Deploy, nem Backups). Todo serviço da plataforma leva o
prefixo `li-`, o que separa os dois produtos e dá os hosts internos `lideranca_li-<serviço>`.
Dentro do projeto, crie cada serviço com **+ Service**. Detalhes de cada um em `deploy/easypanel/servicos.md`. Em todo serviço: depois de
preencher, clique **Save** e depois **Deploy** (o Easypanel só aplica no Deploy).

**Em todos os serviços "App"**, aba **Resources**: preencha o limite de CPU e memória da tabela de
`servicos.md` (reserva 0,1 CPU e 128 MB). Esse limite é o que protege a página de vendas.
Na aba **Domains**, apague qualquer domínio automático que o Easypanel tenha criado sozinho (só ficam
os que este passo manda criar).

### 6.1 `li-db` (Postgres)

1. **+ Service** > **Postgres**. Nome `li-db`. **Image**: `postgres:16.15`. **Database**:
   `lider_impacto_hml`. Senha: deixe o Easypanel gerar. Create.
2. **Não** use a aba Expose (o banco nunca fica aberto para a internet).
3. Resources: CPU 1,5, memória 2048.
4. Aba **Overview** > **Shell** > **psql**. Cole o conteúdo de `deploy/easypanel/banco-bootstrap.sql`
   bloco a bloco. Quando aparecer `Enter new password`, cole a `DB_MIGRACAO_SENHA` (duas vezes) e
   depois a `DB_APP_SENHA` (duas vezes). No fim, `\l lider_impacto_hml` mostra Owner `lider_migracao`.
5. Na aba **Credentials**, confira o host interno: deve ser `lideranca_li-db`. Se for outro, use o que
   aparecer ali no lugar de `lideranca_li-db` em todas as variáveis. **Não confunda com o `db` da página
   de vendas** (host `lideranca_db`): a plataforma nunca usa esse banco.

### 6.2 `li-redis`

1. **+ Service** > **Redis** (o Redis pronto do Easypanel). Nome `li-redis`, senha vazia (o Easypanel
   gera), imagem `redis:7.4`. Criar.
2. Resources: CPU 0,5, memória 768. Deploy.
3. Aba **Credentials**: copie a **URL interna** (`redis://default:<senha>@lideranca_li-redis:6379`).
   Ela é o `REDIS_URL` de `li-app`, `li-worker-certificados` e `li-worker-video`.

(O `deploy/easypanel/redis.Dockerfile`, com AOF ligado, fica como alternativa. Na HML o Redis pronto
basta: a política padrão do Redis já é `noeviction`, o que a fila precisa.)

### 6.3 `li-storage` (SeaweedFS)

1. **+ Service** > **App**. Nome `li-storage`.
2. **Source** > **Dockerfile**: cole o conteúdo de `deploy/easypanel/storage.Dockerfile`.
3. **Environment**: `S3_CHAVE=...` e `S3_SEGREDO=...` (os gerados).
4. **Mounts** > Add **Volume**: nome `seaweed-dados`, caminho `/data`.
5. **Domains** > Add Domain: Host `s3.hml.liderdeimpacto.com.br`, Path `/`, **HTTPS** ligado,
   **Port** `8333`, Certificate resolver `cloudflare`.
6. Resources: CPU 1, memória 1024. Deploy.

### 6.4 Credencial do GHCR (vale para os próximos 4 serviços)

Nos serviços com **Source > Docker Image**: Image `ghcr.io/orbitalbussines-hue/liderimpacto-<nome>:hml`,
**Username** = seu usuário do GitHub, **Password** = o token do passo 4.

As imagens só existem depois do primeiro build do CI. Se ainda não existem, faça agora só o
**item 2 do Passo 7** (`HML_ATIVO=true`) e um push na `develop`: o job publica as imagens e avisa
"deploy NÃO disparado" (esperado: ainda não há gatilhos). Depois volte aqui.

### 6.5 `li-ferramentas` (migra o banco e prepara o storage)

1. **+ Service** > **App**. Nome `li-ferramentas`. Source **Docker Image**: `...liderimpacto-worker:hml` (6.4).
2. **Environment**: o bloco `[ferramentas]` do `env.exemplo`, com as senhas reais.
3. **Deploy** (configurações): **Command**:
   ```
   node --import tsx scripts/db-migrar.ts && npm run -s armazenamento:preparar && exec sleep infinity
   ```
   **Zero Downtime** ligado, **Tini** ligado, **Cap drop** `ALL`.
4. Resources: CPU 0,5, memória 512. Deploy.
5. **Logs**: tem que aparecer `[migrar] migrações em dia.`, `permissões de lider_app reaplicadas` e
   `bucket arquivos: criado`. Se reclamar do storage, o certificado do `s3.hml` ainda está saindo:
   ele tenta de novo sozinho em seguida.

### 6.6 `li-app`

1. **+ Service** > **App**. Nome `li-app`. Source **Docker Image**: `...liderimpacto-app:hml`.
2. **Environment**: bloco `[app]` do `env.exemplo`.
3. **Domains** (dois):
   - Host `hml.liderdeimpacto.com.br`, Path `/`, HTTPS ligado, Port `3000`, resolver `cloudflare`;
   - Host `hml.liderdeimpacto.com.br` de novo, com **Wildcard domain** ligado, Port `3000`, resolver
     `cloudflare` (cobre `<slug>.hml.liderdeimpacto.com.br`).
4. Deploy (configurações): Command vazio, Zero Downtime ligado, Tini ligado, Cap drop `ALL`.
5. Resources: CPU 2, memória 2048. Deploy.

### 6.7 `li-worker-certificados`

**+ Service** > **App**, nome `li-worker-certificados`, Docker Image `...liderimpacto-worker:hml`,
Environment bloco `[worker-certificados]`, Command vazio, Zero Downtime, Tini, Cap drop `ALL`,
Resources CPU 0,5 / memória 768. Sem domínio. Deploy.

### 6.8 `li-worker-video`

**+ Service** > **App**, nome `li-worker-video`, Docker Image `...liderimpacto-worker:hml`,
Environment bloco `[worker-video]`, **Command**:
```
node --conditions=react-server --import tsx scripts/worker-video.ts
```
Zero Downtime, Tini, Cap drop `ALL`. Resources **CPU 3** / memória 3072. Sem domínio. Deploy.
(Teto de 3 vCPU + um vídeo por vez + 720p/480p: a página de vendas sempre tem CPU sobrando.)

### 6.9 `li-backup`

Antes, faça os itens **10.1 a 10.3** do Passo 10 (bucket e token do R2, uns 5 minutos): sem os `R2_*`
o serviço recusa subir.

**+ Service** > **App**, nome `li-backup`, Docker Image `...liderimpacto-backup:hml`, Environment bloco
`[backup]` com os `R2_*` do 10.3.
Command vazio, Tini ligado (sem Cap drop: ele precisa trocar de usuário no teste de restauração).
Resources CPU 0,5 / memória 1024. Sem domínio. Deploy.

### 6.10 Desligar o Auto Deploy e copiar os gatilhos

Em `li-ferramentas`, `li-app`, `li-worker-video`, `li-worker-certificados` e `li-backup`: aba **Deployments**.
Deixe o **Auto Deploy desligado** e copie a **Deployment Trigger URL** de cada um (é um segredo:
não mande por chat). Vai para o GitHub no passo seguinte.

## Passo 7 — GitHub: secrets e ligar o deploy

Repositório `orbitalbussines-hue/Liderimpacto` > **Settings**:

1. **Environments** > `hml` (crie se não existir; opcional: "Deployment branches" = só `develop`) >
   **Environment secrets**, um por serviço:

   | Secret | Valor |
   |--------|-------|
   | `EASYPANEL_DEPLOY_WEBHOOK_FERRAMENTAS` | Trigger URL do `li-ferramentas` |
   | `EASYPANEL_DEPLOY_WEBHOOK_APP` | Trigger URL do `li-app` |
   | `EASYPANEL_DEPLOY_WEBHOOK_WORKER_VIDEO` | Trigger URL do `li-worker-video` |
   | `EASYPANEL_DEPLOY_WEBHOOK_WORKER_CERTIFICADOS` | Trigger URL do `li-worker-certificados` |
   | `EASYPANEL_DEPLOY_WEBHOOK_BACKUP` | Trigger URL do `li-backup` |

   Os secrets antigos `HML_SSH_*` e `HML_APP_DIR` (do plano da VPS crua) não são mais usados: pode apagar.
2. **Secrets and variables** > **Actions** > aba **Variables** > **New repository variable**
   `HML_ATIVO` = `true`.
3. Faça um push na `develop` (ou um commit vazio). Acompanhe em **Actions** > CI/CD > job
   "Deploy HML (Easypanel)". Verde = `https://hml.liderdeimpacto.com.br/api/saude` responde
   `{"ok":true}`. Nas abas **Deployments** dos serviços aparece o deploy novo.

O primeiro certificado curinga leva 1 a 2 minutos (desafio pelo DNS da Cloudflare).

## Passo 8 — Conferir que o storage não caiu no curinga

O curinga `*.hml` e o `s3.hml` são domínios de serviços diferentes. A doc do Easypanel não diz qual
ganha. Confira (PowerShell):

```powershell
curl.exe -s https://s3.hml.liderdeimpacto.com.br/
```

- Veio um XML com `AccessDenied` (ou `<Error>`): é o storage. Certo.
- Veio vazio / erro 404: o curinga do app engoliu o `s3.hml`. Plano B: crie o registro DNS
  `s3-hml` (A, IP da VPS, DNS only), troque o domínio do `li-storage` para `s3-hml.liderdeimpacto.com.br`,
  troque `S3_ENDPOINT` para `https://s3-hml.liderdeimpacto.com.br` em `li-ferramentas`, `li-app` e nos dois
  workers, crie no GitHub a variável `HML_S3_ENDPOINT` com o mesmo endereço e faça um push.

## Passo 9 — Criar o SUPER_ADMIN e o criador do Valmer (uma vez)

Sem senha em lugar nenhum: o seed cria as contas e imprime **links de primeiro acesso** (válidos 24 h);
cada pessoa escolhe a própria senha.

Easypanel > `li-ferramentas` > **Shell** (bash) e rode, com os e-mails reais:

```bash
DATABASE_URL="$DATABASE_URL_APP" SEED_SUPER_ADMIN_EMAIL=seu-email@exemplo.com \
  SEED_DONO_EMAIL=email-do-valmer@exemplo.com SEED_DONO_NOME="Valmer Albuquerque" \
  npm run -s db:seed
```

Saída: o criador **Líder de Impacto** (`lider-de-impacto`), um link para o SUPER_ADMIN
(`https://hml.../primeiro-acesso#token=...`) e um para o DONO (`https://lider-de-impacto.hml.../...`).

1. Abra o SEU link, defina a senha e cadastre o 2º fator (obrigatório para o SUPER_ADMIN).
2. Mande o link do Valmer **só para ele**, por canal privado.
3. Rodar de novo é seguro (não duplica) e gera links novos, invalidando os anteriores.

Outros criadores: `https://hml.liderdeimpacto.com.br/plataforma` > novo criador.

## Passo 10 — Backups no Cloudflare R2 (obrigatório antes de usar de verdade)

**10.1 Bucket.** Cloudflare > **R2 Object Storage** > **Create bucket**: nome `li-backups-hml`,
localização automática, Standard, **privado** (não ligue acesso público nem domínio).

**10.2 Ciclo de vida** (bucket > Settings > Object lifecycle rules) — só para o plano B do banco:
`diario-30d` (prefixo `banco/diario/`, apagar após 30 dias) e `semanal-90d` (prefixo
`banco/semanal/`, 90 dias). O prefixo `storage/` (cópia dos arquivos) não expira.

**10.3 Token.** R2 > **Manage R2 API Tokens** > **Create API token**: **Object Read & Write**,
**Specify bucket(s)** = `li-backups-hml` (só ele), sem fim, filtro de IP = IP da VPS. Copie Access
Key ID, Secret Access Key e o endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

**10.4 Destino no Easypanel.** Settings > **Storage Providers** > Add > **S3** > preset
**Cloudflare R2**: nome `r2-li-backups-hml`, Access Key, Secret, Bucket `li-backups-hml`, Region `auto`,
Endpoint do 10.3.

**10.5 Banco (backup do próprio Easypanel).** `li-db` > aba **Backups** > criar dois:

| Nome | Database | Agenda (hora do servidor, em geral UTC) | Retenção | Destino | Caminho |
|------|----------|------------------------------------------|----------|---------|---------|
| diário | `lider_impacto_hml` | `30 6 * * *` (03:30 de Brasília) | 30 | `r2-li-backups-hml` | `banco/diario` |
| semanal | `lider_impacto_hml` | `0 7 * * 0` (domingo) | 13 | `r2-li-backups-hml` | `banco/semanal` |

Clique **Run now** no diário e confira no R2 que apareceu um `.sql.gz` em `banco/diario/`.
Se o Easypanel avisar que **agendamento exige licença**: ligue o plano B, `BACKUP_BANCO=1` no serviço
`li-backup` (ele passa a fazer o dump do banco no mesmo horário, nos mesmos caminhos) e Deploy.

**10.6 Arquivos (serviço `li-backup`, criado no 6.9).** Ele copia todo dia às 03:30 de Brasília o bucket `lider-arquivos` (capas, materiais,
legendas, PDFs) para `storage/lider-arquivos/` no R2, sem nunca apagar lá. Vídeos ficam fora na HML
(de teste e pesados; o HLS é refeito do original).

**10.7 Teste agora** (Easypanel > `li-backup` > **Shell**):

```bash
backup agora              # cópia dos arquivos (e o banco, se BACKUP_BANCO=1)
backup restaurar-teste    # baixa o último dump de banco/diario/, restaura num Postgres descartável e compara
```

Tem que terminar com `OK: banco/diario/... restaurável.` e a tabela com as contagens. Repita o
`backup restaurar-teste` **todo dia 1º** (lembrete na agenda) e depois de mexer em backup.

## Passo 11 — Checklist de teste

- [ ] `https://hml.liderdeimpacto.com.br/api/saude` → `{"ok":true}`; cadeado válido no navegador
- [ ] `http://hml...` redireciona para `https://`
- [ ] Página de vendas abrindo normal durante e depois de tudo
- [ ] Login do SUPER_ADMIN com 2º fator; `/plataforma` lista o criador
- [ ] `/conta/seguranca` mostra a sessão com o **seu IP público** (não um 10.x / 172.x)
- [ ] `https://lider-de-impacto.hml.liderdeimpacto.com.br` abre o login da área do Valmer
- [ ] `https://nao-existe.hml.liderdeimpacto.com.br` → 404
- [ ] Admin do criador: criar curso, módulo, aula; subir capa (imagem aparece)
- [ ] Subir um vídeo curto: "Processando" → "Pronto" em minutos; toca no player
- [ ] Legenda `.vtt`; material PDF baixa
- [ ] Matricular aluno de teste, assistir, progresso salva; concluir gera certificado (PDF)
- [ ] Comunidade, evento ao vivo, assistente (se `ANTHROPIC_API_KEY` configurada)
- [ ] No Easypanel, todos os serviços `li-` verdes (e o `db`/`site` da página de vendas intactos); Monitor sem CPU/memória no teto
- [ ] Backup: arquivo novo no R2 no dia seguinte; `backup restaurar-teste` OK

---

## Logs

Easypanel > projeto `lideranca` > o serviço `li-...` > **Logs** (ao vivo). Onde olhar:

- site com erro: `li-app`; vídeo parado em "Processando": `li-worker-video`; certificado/lembrete: `li-worker-certificados`;
- deploy que não entra: `li-ferramentas` (migração) e a aba **Deployments** do serviço (saída do deploy);
- certificado: Settings > Traefik (logs do Traefik).

## Voltar uma versão

GitHub > **Actions** > **CI/CD** > **Run workflow** > branch `develop`, campo **versao** = o SHA
completo do commit bom (GitHub > Commits > copiar o SHA) > Run. O job "Voltar versao da HML" aponta
as imagens `hml` para aquele commit e dispara o deploy. O banco não volta: migração só anda para a
frente, e o código antigo funciona sobre o schema novo quando a migração foi aditiva (o padrão).
Se não for, restaure o backup (abaixo).

## Se der errado

**Job vermelho no "Disparar o deploy".** Falta um secret ou a Trigger URL mudou (alguém clicou em
"refresh" no Easypanel): copie de novo e atualize o secret.

**Serviço não fica verde.** Abra os Logs. `li-app` em "não pronto" por muito tempo = `li-ferramentas`
falhou ao migrar (Logs do `li-ferramentas`). Workers em "aguardando o banco migrado" = idem.

**Sem cadeado / erro de certificado.** Logs do Traefik. Causas comuns: registro `hml`/`*.hml`
apontando para outro IP, token sem `Zone:Read` + `DNS:Edit` da zona certa (ou filtro de IP errado),
resolver escrito diferente de `cloudflare` no domínio.

**Restaurar o banco de verdade (perde o que foi gravado depois do dump).** ATENÇÃO: destrói o banco atual.
1. Pare `li-app`, `li-worker-video`, `li-worker-certificados` (botão Stop de cada um).
2. `li-db` > Backups > **Run now** (cópia de segurança do estado atual).
3. `li-db` > Backups > **Restore**: destino `r2-li-backups-hml`, caminho completo do arquivo
   (ex.: `banco/diario/<arquivo>.sql.gz`), Database `lider_impacto_hml`.
4. `li-ferramentas` > Deploy (reaplica as permissões da app), depois Start nos três parados.
5. Registre o incidente (o quê, quando, qual dump).

**Trocar uma senha.** Banco: `li-db` > Shell > psql > `\password lider_app` (ou `lider_migracao`), depois
atualize o valor nas variáveis dos serviços que usam e Deploy neles. Redis e S3: troque nos serviços
que usam (`li-redis`/`li-storage` e quem conecta) e Deploy. **Nunca** troque `VIDEO_CHAVE_MESTRA`.

**Disco enchendo.** Easypanel > Monitor. Vídeos de teste podem ser removidos pela tela do admin.

**A página de vendas ficou lenta.** Easypanel > Monitor: veja qual serviço `li-` está no
teto. Baixe o limite dele (Resources) ou pare o `li-worker-video` até o transcode acabar, e me avise
(ADR-0016, "Quando separar").

## Testar localmente antes de mexer no deploy

As imagens e o desenho foram validados no Docker Desktop num projeto separado (`-p li-ep-teste`):
banco com o `banco-bootstrap.sql`, Redis e storage pelos Dockerfiles inline, app e workers subindo
ANTES da migração (saúde 503, workers aguardando), dois `li-ferramentas` ao mesmo tempo (o segundo
espera a trava), saúde 200 depois, seed como `lider_app`, `backup agora` e `backup restaurar-teste`
com dump do script e com dump no formato do Easypanel. Derrube só esse projeto no fim:
`docker compose -p li-ep-teste down -v`.
