# Deploy da PRODUÇÃO no Easypanel — passo a passo

A plataforma vai **direto para produção** no Easypanel da VPS Hostinger KVM 8, projeto **`lideranca`**,
sem homologação (decisão do Paulo em 17/10, ADR-0017; desenho dos serviços no ADR-0016).

| O quê | Endereço |
|-------|----------|
| Plataforma (SUPER_ADMIN) | `https://lideresdeimpacto.com.br` (e `https://www.lideresdeimpacto.com.br`) |
| Área de cada criador | `https://<slug>.lideresdeimpacto.com.br` (Valmer: `lider-de-impacto`) |
| Storage (envio direto do navegador) | `https://s3.lideresdeimpacto.com.br` |

Arquivos de apoio: `deploy/easypanel/servicos.md` (ficha de cada serviço), `deploy/easypanel/env.exemplo`
(variáveis de cada serviço e como gerar os segredos), `deploy/easypanel/backup.sh` (backups),
`deploy/easypanel/ferramentas.sh` (o que roda a cada deploy).

## Como o deploy funciona (depois de pronto)

1. O trabalho entra na `develop` (só roda o CI: auditor, lint, tipos, testes, build).
2. Para publicar, a `develop` é mesclada na `master` (o assistente faz o merge quando você pedir).
3. Na `master`, o GitHub Actions roda o CI de novo. Só se passar:
4. constrói as imagens (app, worker, backup) **no GitHub, não na VPS**, e publica com a tag `prd`;
5. chama o "Deployment Trigger" de cada serviço no Easypanel: primeiro `li-ferramentas`, que
   **faz o backup do banco no R2 ANTES de tudo**, depois migra o banco e libera a versão nova; em
   seguida app, workers e backup;
6. app e workers novos só entram no ar depois que o `li-ferramentas` liberou a versão deles (ou seja,
   depois do backup e da migração). Até lá a versão anterior segue atendendo. **Backup falhou = a
   versão nova não entra** (o `li-ferramentas` tenta de novo a cada 5 min);
7. o CI confere `https://lideresdeimpacto.com.br/api/saude`.

O "Auto Deploy" do Easypanel fica **desligado**: nada vai ao ar sem o CI verde.

---

## Ponto de partida (17/10)

Já existem e estão verdes no projeto `lideranca`: `li-db` (Postgres 16.15, banco `lider_impacto`,
papéis `lider_migracao` e `lider_app` criados pelo `banco-bootstrap.sql`), `li-redis` (Redis pronto
do Easypanel) e `li-storage` (SeaweedFS pelo `storage.Dockerfile`, volume `/data`). Os passos abaixo
partem daí.

## Passo 1 — Conferir o DNS atual (antes de mexer em qualquer coisa)

Cloudflare > `lideresdeimpacto.com.br` > **DNS** > **Records**. Tire um print da lista inteira e guarde.

1. **Apex (`lideresdeimpacto.com.br`, Name `@`) e `www`**: anote para onde apontam hoje (A/AAAA/CNAME).
   Se apontam para um site que está no ar (página antiga, construtor de site), combine antes: depois
   do Passo 3 esse site sai do ar nesse endereço.
2. **E-mail**: registros **MX**, **TXT** com `v=spf1`, `_dmarc`, `*._domainkey` (DKIM) e qualquer
   `mail`/`webmail`/`autodiscover`. **NUNCA apague nem edite esses.** O curinga `*` não afeta nenhum
   registro que já exista (um registro com nome próprio sempre ganha do curinga).
3. **Outros subdomínios** que já existam (`blog`, `loja`...): continuam valendo. Atenção: o app manda
   HSTS com `includeSubDomains` no apex, então os navegadores passam a exigir **HTTPS em todos os
   subdomínios** de `lideresdeimpacto.com.br`. Se algum desses só funciona em `http://`, avise antes.
4. Se apex/`www` tiverem **AAAA** (IPv6) apontando para outro servidor, apague só esses AAAA no
   Passo 3 (senão parte dos acessos vai para o lugar antigo).

## Passo 2 — Token da Cloudflare para o certificado curinga

Cloudflare > ícone do perfil > **My Profile** > **API Tokens** > **Create Token** > **Create Custom Token**:

- **Token name**: `easypanel-traefik-lideresdeimpacto`
- **Permissions** (duas linhas): `Zone` · `Zone` · `Read` e `Zone` · `DNS` · `Edit`
- **Zone Resources**: `Include` · `Specific zone` · `lideresdeimpacto.com.br`
- **Client IP Address Filtering** (recomendado): `Is in` · o IP da VPS
- **TTL**: sem data de fim

Continue > Create Token > **copie o token** (aparece uma vez) e guarde no gerenciador de senhas.

## Passo 3 — Registros DNS da produção

Cloudflare > `lideresdeimpacto.com.br` > **DNS** > **Records**. Para cada linha: se já existe, **Edit**;
se não, **Add record**. Sem tocar nos registros de e-mail do Passo 1.

| Type | Name | IPv4 | Proxy status |
|------|------|------|--------------|
| A | `@` | IP da VPS | **DNS only** (nuvem CINZA) |
| A | `www` | IP da VPS | **DNS only** |
| A | `*` | IP da VPS | **DNS only** |
| A | `s3` | IP da VPS | **DNS only** |

Se `@` ou `www` eram **CNAME**, apague o CNAME e crie o A (não convivem no mesmo nome).
Por que nuvem cinza: o certificado é o curinga do Traefik (Passo 4), o app precisa ver o IP real de
quem acessa (bloqueio de login por IP) e o suporte do Easypanel manda usar "DNS only" quando o
certificado não renova. **Não mude o modo SSL/TLS da zona.**

Confira (PowerShell): `Resolve-DnsName lideresdeimpacto.com.br`, `Resolve-DnsName teste.lideresdeimpacto.com.br`
e `Resolve-DnsName s3.lideresdeimpacto.com.br` → IP da VPS. `Resolve-DnsName -Type MX lideresdeimpacto.com.br`
→ igual ao print do Passo 1.

## Passo 4 — Resolver curinga no Traefik do Easypanel

Reiniciar o Traefik derruba **todos** os sites da VPS por alguns segundos: faça fora do pico.

1. Easypanel > **Settings** > **Traefik** > **Environment**.
2. Descubra o e-mail que o Easypanel já usa para o Let's Encrypt (Settings; é o mesmo para todos os
   resolvers).
3. Acrescente (sem apagar o que já existe) as linhas da seção `[traefik]` de `deploy/easypanel/env.exemplo`,
   com o e-mail e o token do Passo 2 em `CF_DNS_API_TOKEN`.
4. Salve e clique em **Restart** (Traefik). Os outros sites da VPS têm que voltar em segundos. Não
   voltaram? Apague as linhas novas, salve, Restart, e me avise.

O nome do resolver nos domínios é `cloudflare`, em minúsculas.

## Passo 5 — Conferir/ajustar `li-db`, `li-redis` e `li-storage` (já criados)

1. **`li-db`** > Resources: CPU **2**, memória **4096** (reserva 0,1 / 128). Nunca use a aba Expose.
   Credentials: host interno `lideranca_li-db`, banco `lider_impacto`.
2. **`li-redis`** > Resources: CPU 0,5, memória 768. Credentials: copie a **URL interna**
   (`redis://default:<senha>@lideranca_li-redis:6379`): é o `REDIS_URL` de `li-app` e dos dois
   workers. Console do `li-redis`: `redis-cli -a '<senha>' CONFIG GET maxmemory-policy` tem que
   responder `noeviction` (a fila exige; é o padrão do Redis).
3. **`li-storage`** > Domains: Host `s3.lideresdeimpacto.com.br`, Path `/`, **HTTPS** ligado, Port
   **8333**, Certificate resolver `cloudflare` (troque se ainda estiver com outro host). Resources: CPU 1,
   memória 1024. Deploy.

## Passo 6 — Token do GitHub para o Easypanel baixar as imagens

GitHub > foto > **Settings** > **Developer settings** > **Personal access tokens** > **Tokens (classic)**
> **Generate new token (classic)**: nota `easypanel-prd-ghcr`, expiração 1 ano (anote na agenda para
renovar), marque **só** `read:packages`. Gere e guarde no gerenciador de senhas. (Os "fine-grained"
não servem para o GHCR. Este token só lê imagens; não mexe em código.)

## Passo 7 — Segredos

`DB_MIGRACAO_SENHA`, `DB_APP_SENHA` (usadas no `banco-bootstrap.sql`) e `S3_CHAVE`/`S3_SEGREDO` (do
`li-storage`) **já existem**: pegue no gerenciador de senhas. Gere os que faltam no Git Bash:

```bash
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
for n in VIDEO_CHAVE_MESTRA VIDEO_SEGREDO_TOKEN; do echo "$n=$(openssl rand -base64 32)"; done
```

Guarde tudo no gerenciador de senhas. Sem a `VIDEO_CHAVE_MESTRA` nenhum vídeo processado volta a
tocar: nunca troque ela depois (exige rotação, `docs/back.md`).

## Passo 8 — Cloudflare R2: bucket e token dos backups

1. **Bucket.** Cloudflare > **R2 Object Storage** > **Create bucket**: nome `li-backups-prd`,
   localização automática, Standard, **privado** (sem acesso público, sem domínio).
2. **Ciclo de vida** (bucket > Settings > Object lifecycle rules), três regras "apagar objetos":
   | Regra | Prefixo | Apagar após |
   |-------|---------|-------------|
   | `diario-30d` | `banco/diario/` | 30 dias |
   | `semanal-90d` | `banco/semanal/` | 90 dias |
   | `pre-deploy-90d` | `banco/pre-deploy/` | 90 dias |

   O prefixo `storage/` (cópia dos arquivos e vídeos originais) não expira.
3. **Token.** R2 > **Manage R2 API Tokens** > **Create API token**: **Object Read & Write**,
   **Specify bucket(s)** = `li-backups-prd` (só ele), sem fim, filtro de IP = IP da VPS. Copie Access
   Key ID, Secret Access Key e o endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Ele vai no
   `li-ferramentas` (backup antes do deploy) e no `li-backup` (diário).

## Passo 9 — GitHub: environment `prd` e a branch `master`

Repositório `orbitalbussines-hue/Liderimpacto` > **Settings**:

1. **Environments** > **New environment** `prd`. Em "Deployment branches and tags": **Selected
   branches** > `master`. (Os secrets entram no Passo 12.)
2. **Ainda não** crie a variável `PRD_ATIVO`.
3. Criar a `master` a partir da `develop`: **o assistente faz o merge develop→master quando você
   pedir**. (Ou pela interface: aba **Code** > seletor de branch > digite `master` > "Create branch
   master from develop".) Depois: Settings > **Branches** > regra para `master` exigindo o check do CI
   ("Verificar") antes de merge.
4. Acompanhe em **Actions** > CI/CD: o job "Deploy PRD (Easypanel)" publica as imagens e termina
   **verde com um aviso** "PRD_ATIVO != true ... deploy NAO disparado". É o esperado: agora as imagens
   `liderimpacto-{app,worker,backup}:prd` existem no GHCR.

## Passo 10 — Criar os serviços (nesta ordem)

Projeto **`lideranca`** > **+ Service** > **App** para cada um. Em todos: depois de preencher, **Save**
e depois **Deploy**. Detalhes em `deploy/easypanel/servicos.md`.

**Em todos:** **Source > Docker Image** = `ghcr.io/orbitalbussines-hue/liderimpacto-<imagem>:prd`,
**Username** = seu usuário do GitHub, **Password** = token do Passo 6. Aba **Deploy**: Zero Downtime
ligado, Tini ligado, Cap drop `ALL` (exceto `li-backup`). Aba **Resources**: os limites da tabela de
`servicos.md` (reserva 0,1 CPU / 128 MB). Aba **Domains**: apague qualquer domínio automático.
Aba **Deployments**: **Auto Deploy desligado**.

1. **`li-ferramentas`** — imagem `worker`. Environment: bloco `[li-ferramentas]` do `env.exemplo`
   (com os `R2_*` do Passo 8). **Command**: `ferramentas`. Resources 0,5 / 768. Deploy.
   Logs esperados (banco vazio):
   `pre-deploy: banco vazio (1º deploy), nada a salvar` → `[migrar] migrações em dia.` →
   `permissões de lider_app reaplicadas` → `[migrar] versão <sha> liberada.` → `bucket arquivos: criado`.
   Erro no storage = o certificado do `s3` ainda está saindo: ele tenta de novo em 5 min sozinho.
2. **`li-app`** — imagem `app`. Environment: bloco `[li-app]` (o `REDIS_URL` é a URL interna do
   Passo 5). Command vazio. **Domains** (três, todos HTTPS, Port `3000`, resolver `cloudflare`):
   `lideresdeimpacto.com.br`; `www.lideresdeimpacto.com.br`; `lideresdeimpacto.com.br` de novo com
   **Wildcard domain** ligado (cobre `<slug>.lideresdeimpacto.com.br`). Resources 2 / 3072. Deploy.
3. **`li-worker-certificados`** — imagem `worker`, bloco `[li-worker-certificados]`, Command vazio,
   Resources 0,5 / 768. Deploy.
4. **`li-worker-video`** — imagem `worker`, bloco `[li-worker-video]`, **Command**
   `node --conditions=react-server --import tsx scripts/worker-video.ts`, Resources **3** / 3072. Deploy.
5. **`li-backup`** — imagem `backup`, bloco `[li-backup]`, Command vazio, Tini ligado, **sem** Cap
   drop (ele troca de usuário no teste de restauração). Resources 0,5 / 1024. Deploy.

## Passo 11 — Conferir que o storage não caiu no curinga

O curinga `*` (do `li-app`) e o `s3` (do `li-storage`) são de serviços diferentes. PowerShell:

```powershell
curl.exe -s https://s3.lideresdeimpacto.com.br/
```

- Veio um XML com `AccessDenied` (ou `<Error>`): é o storage. Certo.
- Veio a página do app ou 404: o curinga engoliu o `s3`. Plano B: registro DNS `arquivos` (A, IP da
  VPS, DNS only), domínio do `li-storage` = `arquivos.lideresdeimpacto.com.br`, `S3_ENDPOINT` =
  `https://arquivos.lideresdeimpacto.com.br` em `li-ferramentas`, `li-app` e nos dois workers, variável
  do GitHub `PRD_S3_ENDPOINT` com o mesmo endereço, e me peça para reservar o slug `arquivos`.

## Passo 12 — GitHub: secrets e ligar o deploy

1. Em `li-ferramentas`, `li-app`, `li-worker-video`, `li-worker-certificados` e `li-backup`: aba
   **Deployments** > copie a **Deployment Trigger URL** (é um segredo: não mande por chat).
2. GitHub > Settings > **Environments** > `prd` > **Environment secrets**, um por serviço:

   | Secret | Valor |
   |--------|-------|
   | `EASYPANEL_DEPLOY_WEBHOOK_FERRAMENTAS` | Trigger URL do `li-ferramentas` |
   | `EASYPANEL_DEPLOY_WEBHOOK_APP` | Trigger URL do `li-app` |
   | `EASYPANEL_DEPLOY_WEBHOOK_WORKER_VIDEO` | Trigger URL do `li-worker-video` |
   | `EASYPANEL_DEPLOY_WEBHOOK_WORKER_CERTIFICADOS` | Trigger URL do `li-worker-certificados` |
   | `EASYPANEL_DEPLOY_WEBHOOK_BACKUP` | Trigger URL do `li-backup` |

3. **Secrets and variables** > **Actions** > aba **Variables** > **New repository variable**
   `PRD_ATIVO` = `true`.

## Passo 13 — Primeiro deploy pelo CI

**Actions** > CI/CD > a última execução na `master` > **Re-run all jobs**. O job "Deploy PRD" agora
dispara os gatilhos e termina com `{"ok":true}` de `https://lideresdeimpacto.com.br/api/saude`. Nas
abas **Deployments** dos serviços aparece o deploy novo. O primeiro certificado curinga leva 1 a 2 min.

## Passo 14 — Criar o SUPER_ADMIN e o criador do Valmer (uma vez)

Sem senha em lugar nenhum: o seed cria as contas e imprime **links de primeiro acesso** (válidos 24 h).
**Nada de dados de demonstração**: `seed:demo`, `seed:demo:*` e `sessao:demo` recusam rodar em produção.

Easypanel > `li-ferramentas` > **Shell** (bash), com os e-mails reais:

```bash
DATABASE_URL="$DATABASE_URL_APP" SEED_SUPER_ADMIN_EMAIL=seu-email-real \
  SEED_DONO_EMAIL=email-real-do-valmer SEED_DONO_NOME="Valmer Albuquerque" \
  npm run -s db:seed
```

Saída: o criador **Líder de Impacto** (`lider-de-impacto`), um link do SUPER_ADMIN
(`https://lideresdeimpacto.com.br/primeiro-acesso#token=...`) e um do DONO
(`https://lider-de-impacto.lideresdeimpacto.com.br/...`).

1. Abra o SEU link, defina a senha e cadastre o 2º fator (obrigatório para o SUPER_ADMIN).
2. Mande o link do Valmer **só para ele**, por canal privado.
3. Rodar de novo é seguro (não duplica) e gera links novos, invalidando os anteriores.

## Passo 15 — Checklist

- [ ] `https://lideresdeimpacto.com.br/api/saude` → `{"ok":true}`; cadeado válido no navegador
- [ ] `http://lideresdeimpacto.com.br` redireciona para `https://`; `https://www...` abre a plataforma
- [ ] E-mail do domínio funcionando (mande e receba uma mensagem); MX igual ao print do Passo 1
- [ ] Login do SUPER_ADMIN com 2º fator; `/plataforma` lista o criador
- [ ] `/conta/seguranca` mostra a sessão com o **seu IP público** (não um 10.x / 172.x)
- [ ] `https://lider-de-impacto.lideresdeimpacto.com.br` abre o login da área do Valmer
- [ ] `https://nao-existe.lideresdeimpacto.com.br` → 404
- [ ] Admin do criador: criar curso, módulo, aula; subir capa (imagem aparece)
- [ ] Subir um vídeo curto: "Processando" → "Pronto" em minutos; toca no player
- [ ] Legenda `.vtt`; material PDF baixa
- [ ] Aluno de teste (e-mail seu): matricular, assistir, progresso salva, certificado (PDF)
- [ ] Comunidade, evento ao vivo, assistente (se `ANTHROPIC_API_KEY` configurada)
- [ ] Todos os serviços `li-` verdes; Monitor sem CPU/memória no teto
- [ ] SMTP configurado no `li-app` (recuperação de senha pelo próprio aluno)
- [ ] Depois do teste, apague (pela tela) o curso e o aluno de teste

## Passo 16 — Backup + teste de restauração ANTES de abrir para alunos

Obrigatório antes do primeiro aluno real. Easypanel > `li-backup` > **Shell**:

```bash
backup agora                              # arquivos + vídeos originais + dump do banco em banco/diario/
backup restaurar-teste                    # restaura o último de banco/diario/ num Postgres descartável
```

Tem que terminar com `OK: banco/diario/... restaurável.` e a tabela de contagens. Depois, faça um
deploy qualquer (Re-run do job na `master`) e confirme o backup antes do deploy:

```bash
backup restaurar-teste banco/pre-deploy/  # o dump que o li-ferramentas fez antes de migrar
```

No R2 (bucket `li-backups-prd`) devem existir `banco/diario/`, `banco/pre-deploy/` e `storage/`.
Depois: **todo dia 1º** (lembrete na agenda) rode `backup restaurar-teste` de novo.

---

## Cada novo deploy

1. O trabalho entra e é testado na `develop` (CI verde). Mudança grande (migração que altera dado,
   troca de biblioteca de auth, mudança no deploy): valide antes no compose local de teste
   (ADR-0017).
2. Peça ao assistente o merge `develop` → `master` (ou abra um Pull Request develop → master e mescle).
3. Acompanhe **Actions** > "Deploy PRD". Verde = no ar. Em `li-ferramentas` > Logs: `banco:
   backup_... enviado para banco/pre-deploy` antes de `[migrar] versão <sha> liberada`.

## Voltar uma versão

GitHub > **Actions** > **CI/CD** > **Run workflow** > branch **`master`**, campo **versao** = o SHA
completo do commit bom (GitHub > Commits > copiar o SHA) > Run. O job "Voltar versao da PRD" aponta as
imagens `prd` para aquele commit e dispara o deploy (com backup antes, como sempre). O banco não
volta: migração só anda para a frente, e o código antigo funciona sobre o schema novo quando a
migração foi aditiva (o padrão). Se não for, restaure o banco (abaixo).

## Restaurar o banco (perde o que foi gravado depois do dump)

ATENÇÃO: substitui o banco no ar. Só com motivo e registrando o incidente.

1. Escolha o arquivo no R2 (`li-backups-prd` > `banco/pre-deploy/` para "antes do último deploy",
   `banco/diario/` para o da madrugada). Anote o caminho completo, ex.
   `banco/pre-deploy/backup_17_10_2026_21_30.sql.gz`.
2. Pare `li-app`, `li-worker-video` e `li-worker-certificados` (botão Stop de cada um).
3. `li-backup` > **Shell**:
   ```bash
   backup restaurar banco/pre-deploy/backup_17_10_2026_21_30.sql.gz lider_impacto
   ```
   Ele confere o nome do banco, guarda uma cópia do estado atual em `banco/pre-deploy/` e restaura
   numa transação só (deu erro no meio = nada muda).
4. `li-ferramentas` > **Deploy** (reaplica as permissões da app), depois Start nos três parados.
5. Registre o incidente (o quê, quando, qual arquivo).

## Logs

Easypanel > projeto `lideranca` > o serviço `li-...` > **Logs** (ao vivo):

- site com erro: `li-app`; vídeo parado em "Processando": `li-worker-video`; certificado/lembrete:
  `li-worker-certificados`;
- deploy que não entra: `li-ferramentas` (backup e migração) e a aba **Deployments** do serviço;
- backups: `li-backup`; certificado TLS: Settings > Traefik (logs do Traefik).

## Se der errado

**Job vermelho no "Disparar o deploy".** Falta um secret ou a Trigger URL mudou (alguém clicou em
"refresh" no Easypanel): copie de novo e atualize o secret.

**Versão nova não entra (app em 503, workers "aguardando o li-ferramentas").** Logs do
`li-ferramentas`: `[ferramentas] FALHOU`. Se o erro é do R2 (403, bucket, endpoint), confira os `R2_*`
do `li-ferramentas` e o token do Passo 8; se é da migração, me chame. A versão anterior segue no ar
enquanto isso, e ele tenta de novo a cada 5 min.

**Sem cadeado / erro de certificado.** Logs do Traefik. Causas comuns: registro `@`/`*` apontando para
outro IP ou com nuvem laranja, token sem `Zone:Read` + `DNS:Edit` da zona certa (ou filtro de IP
errado), resolver escrito diferente de `cloudflare` no domínio.

**Trocar uma senha.** Banco: `li-db` > Shell > psql > `\password lider_app` (ou `lider_migracao`),
depois atualize nos serviços que usam e Deploy neles. Redis e S3: troque no serviço e em quem conecta,
e Deploy. **Nunca** troque `VIDEO_CHAVE_MESTRA`.

**Disco enchendo.** Easypanel > Monitor. Vídeos e originais ficam no volume do `li-storage`.

## Testar localmente antes de mexer no deploy

As imagens e o backup pré-deploy foram validados no Docker Desktop num projeto separado
(`-p li-prd-teste`): Postgres com os papéis do `banco-bootstrap.sql`, SeaweedFS fazendo de "R2",
`ferramentas` com banco vazio (pula o backup, migra, libera a versão), com banco populado (dump em
`banco/pre-deploy/` antes de migrar), com o R2 recusando (não migra, não libera; worker da versão nova
esperando e o da anterior atendendo), `backup restaurar-teste banco/pre-deploy/`, `backup restaurar`
com a confirmação do nome, e `/api/saude` 200 só para a versão liberada. Derrube só esse projeto no
fim: `docker compose -p li-prd-teste down -v`.
