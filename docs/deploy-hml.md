# Deploy da homologação (HML) — passo a passo (VPS dedicada)

> **A HML atual roda no Easypanel** (ADR-0016): siga `docs/deploy-easypanel.md`. Este runbook é a
> ALTERNATIVA para uma VPS só do projeto (ADR-0015). O job `deploy-hml` do CI agora dispara o
> Easypanel; o caminho por SSH saiu do CI (os passos 8 e 9 abaixo ficam sem efeito). Para usar este:
> o CI continua publicando `liderimpacto-{app,worker,caddy}:<sha>` no GHCR; na VPS, copie
> `deploy/hml/*` para `/opt/lider-impacto`, faça `docker login ghcr.io` (token `read:packages`) e rode
> `./implantar.sh <sha>` à mão. Para voltar ao deploy automático por SSH, restaure o job antigo do
> histórico do git (ADR-0016).

Ambiente de homologação em **uma VPS** (decisão e porquês no ADR-0015). Endereços:

| O quê | Endereço |
|-------|----------|
| Plataforma (SUPER_ADMIN) | `https://hml.liderdeimpacto.com.br` |
| Área de cada criador | `https://<slug>.hml.liderdeimpacto.com.br` (Valmer: `lider-de-impacto`) |
| Storage (envio direto do navegador) | `https://s3.hml.liderdeimpacto.com.br` |

Arquivos: `deploy/hml/` (compose, Caddyfile, scripts), `deploy/docker/` (imagens),
`.github/workflows/deploy.yml` (job `deploy-hml`). Variáveis: `deploy/hml/env.exemplo`.

## Custo mensal estimado

| Item | Custo |
|------|-------|
| VPS Hostinger **KVM 2** (2 vCPU, 8 GB RAM, 100 GB NVMe, 8 TB de banda) | ≈ R$ 33–39/mês no contrato de 24 meses (renovação ≈ R$ 70/mês). Confira no checkout |
| Cloudflare (DNS) | grátis |
| Cloudflare R2 (backup) | US$ 0,015/GB/mês, sem taxa de saída; os primeiros 10 GB/mês são grátis. Backup da HML (dumps de poucos MB + arquivos): ≈ US$ 0 |
| Anthropic (assistente) | por uso: ≈ US$ 0,01 por pergunta com o modelo padrão (estimativa pela tabela de preços do app). 500 perguntas de teste ≈ US$ 5. Sem chave = assistente desligado, custo zero |
| **Total** | **≈ R$ 40/mês + IA por uso** |

O KVM 2 é suficiente para HML: o worker de vídeo tem teto de 1,25 vCPU e um vídeo de 1 h leva
algumas horas para transcodificar (aceitável para teste). Se for subir muito vídeo, use o KVM 4.

## Como o deploy funciona (depois de pronto)

1. Você faz push na `develop`.
2. O GitHub Actions roda o CI (auditor, lint, tipos, testes, build). Passou:
3. constrói 3 imagens (app, worker, caddy) e publica no GitHub Container Registry com a tag = SHA do commit;
4. copia `deploy/hml/*` para `/opt/lider-impacto` na VPS e roda `./implantar.sh <sha>`, que:
   baixa as imagens → garante banco/Redis/storage/Caddy → **migra o banco** → prepara os buckets →
   troca app e workers e espera ficarem saudáveis → guarda a versão anterior para rollback;
5. confere de fora `https://hml.liderdeimpacto.com.br/api/saude`. Não respondeu 200 = job vermelho.

---

## Passo 1 — Contratar a VPS

1. Hostinger > VPS > plano **KVM 2**. Sistema: **Ubuntu 24.04** (o "puro", sem painel). Local: Brasil
   (São Paulo), se disponível.
2. Na criação, adicione a sua chave SSH pública (passo 2) e anote o **IP** da VPS.
3. Não instale nada pelo painel da Hostinger (o bootstrap faz tudo).

## Passo 2 — Chaves SSH no Windows (PowerShell)

Duas chaves: a SUA (para você entrar) e a do GitHub Actions (só para deploy).

```powershell
ssh-keygen -t ed25519 -C "paulo-lider-hml"                                 # Enter, Enter (pode pôr senha)
ssh-keygen -t ed25519 -f $HOME\.ssh\lider-hml-ci -N '""' -C "ci-hml"       # sem senha: o CI não digita
Get-Content $HOME\.ssh\id_ed25519.pub                                       # a sua (vai para a Hostinger)
```

A chave **privada** `lider-hml-ci` (sem `.pub`) vai SÓ para o secret do GitHub (passo 8). Nunca mande
chave privada por chat ou e-mail.

## Passo 3 — Levar o DNS do domínio para a Cloudflare

1. Crie conta em `dash.cloudflare.com` > **Add a domain** > `liderdeimpacto.com.br` > plano **Free**.
2. A Cloudflare copia os registros atuais. **Confira** antes de seguir, principalmente os de e-mail
   (`MX`, `TXT` de SPF/DKIM) e o do site atual: o que faltar aqui para de funcionar na troca.
3. Ela mostra **dois nameservers** (ex.: `ana.ns.cloudflare.com`, `bob.ns.cloudflare.com`).
4. Troque os nameservers onde o domínio está registrado:
   - **registro.br**: entre em `registro.br` > o domínio > **DNS** > "Alterar servidores DNS" > ponha
     os dois da Cloudflare (apague os antigos) > salvar.
   - **Hostinger** (se comprou o domínio lá): hPanel > Domínios > `liderdeimpacto.com.br` >
     **DNS / Nameservers** > "Alterar nameservers" > os dois da Cloudflare.
5. Espere a Cloudflare mostrar o domínio como **Active** (minutos a algumas horas).

O que muda: quem responde o DNS passa a ser a Cloudflare. O registro do domínio, o e-mail e o site
continuam onde estão, desde que os registros tenham sido copiados no item 2.

## Passo 4 — Token da Cloudflare para o certificado

Cloudflare > ícone do perfil > **My Profile** > **API Tokens** > **Create Token** > modelo
**Edit zone DNS** > Use template:

- **Permissions**: `Zone` · `DNS` · `Edit` (só esta linha)
- **Zone Resources**: `Include` · `Specific zone` · `liderdeimpacto.com.br`
- **Client IP Address Filtering** (recomendado): `Is in` · o IP da VPS
- **TTL**: sem data de fim

Continue > Create Token > **copie o token** (aparece uma vez). Ele vai no `.env` da VPS
(`CLOUDFLARE_API_TOKEN`) e só o contêiner do Caddy o recebe.

## Passo 5 — Registros DNS da HML

Cloudflare > o domínio > **DNS** > **Records** > Add record (duas vezes):

| Type | Name | IPv4 | Proxy status |
|------|------|------|--------------|
| A | `hml` | IP da VPS | **DNS only** (nuvem CINZA) |
| A | `*.hml` | IP da VPS | **DNS only** (nuvem CINZA) |

Nuvem cinza é obrigatório: o plano grátis não faz proxy de `*.hml` (curinga de 2º nível) e o
certificado é emitido pelo próprio Caddy. O `*.hml` já cobre `s3.hml` e todos os criadores.
Confira (PowerShell): `Resolve-DnsName teste.hml.liderdeimpacto.com.br` → IP da VPS.

## Passo 6 — Preparar a VPS (bootstrap, uma vez)

No PowerShell, na pasta do projeto:

```powershell
scp $HOME\.ssh\id_ed25519.pub $HOME\.ssh\lider-hml-ci.pub deploy\hml\bootstrap.sh root@IP_DA_VPS:/root/
ssh root@IP_DA_VPS
```

Na VPS (como root):

```bash
bash /root/bootstrap.sh "$(cat /root/id_ed25519.pub)" "$(cat /root/lider-hml-ci.pub)"
```

Ele cria o usuário `deploy` (com as duas chaves), fecha o SSH para senha e para root, liga firewall
(22, 80, 443), fail2ban, atualizações automáticas de segurança, instala o Docker oficial, cria 4 GB de
swap e a pasta `/opt/lider-impacto`. **Antes de fechar a janela do root**, abra outra e teste:
`ssh deploy@IP_DA_VPS`. Entrou? Pode fechar a do root (ela não entra mais).

## Passo 7 — Criar o `.env` do servidor

```bash
ssh deploy@IP_DA_VPS
cd /opt/lider-impacto
nano .env
```

Cole o conteúdo de `deploy/hml/env.exemplo` e preencha à mão: `ACME_EMAIL`, `CLOUDFLARE_API_TOKEN`,
os `R2_*` (passo 12; pode ficar para depois) e, se for usar o assistente, `ANTHROPIC_API_KEY`
(e `ANTHROPIC_WORKSPACE_ID` se a chave for de organização). Salve (Ctrl+O, Enter, Ctrl+X). Depois gere
TODOS os segredos no lugar dos marcadores, sem que apareçam na tela:

```bash
for n in DB_SUPERUSUARIO_SENHA DB_MIGRACAO_SENHA DB_APP_SENHA REDIS_SENHA S3_SEGREDO; do
  sed -i "s|^$n=gere-.*|$n=$(openssl rand -hex 32)|" .env; done
sed -i "s|^S3_CHAVE=gere-.*|S3_CHAVE=$(openssl rand -hex 16)|" .env
sed -i "s|^BETTER_AUTH_SECRET=gere-.*|BETTER_AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n')|" .env
for n in VIDEO_CHAVE_MESTRA VIDEO_SEGREDO_TOKEN; do
  sed -i "s|^$n=gere-.*|$n=$(openssl rand -base64 32)|" .env; done
chmod 600 .env
grep -c 'gere-' .env    # TEM que dar 0
```

**Guarde uma cópia do `.env` no seu gerenciador de senhas.** Sem a `VIDEO_CHAVE_MESTRA` nenhum vídeo
processado volta a tocar; sem as senhas do banco o backup não restaura no mesmo servidor.

## Passo 8 — GitHub: environment `hml` e secrets

Repositório `orbitalbussines-hue/Liderimpacto` > **Settings** > **Environments** > **New environment**
> `hml` (opcional: "Deployment branches" = só `develop`). Em **Environment secrets**:

| Secret | Valor |
|--------|-------|
| `HML_SSH_HOST` | IP da VPS |
| `HML_SSH_USER` | `deploy` |
| `HML_SSH_KEY` | conteúdo INTEIRO de `$HOME\.ssh\lider-hml-ci` (a privada, com as linhas BEGIN/END) |
| `HML_KNOWN_HOSTS` | saída de `ssh-keyscan -t ed25519 IP_DA_VPS` (confira que a impressão digital é a mesma que o `ssh` mostrou no passo 6) |
| `HML_APP_DIR` | `/opt/lider-impacto` |

Registro de imagens (GHCR): nada a configurar. O job publica com o token automático do GitHub e a VPS
baixa com o mesmo token temporário. Se o repositório for de uma **organização**, confira em
Organization settings > Packages que membros podem criar pacotes **privados**.

## Passo 9 — Primeiro deploy

Ligue o deploy: **Settings** > **Secrets and variables** > **Actions** > aba **Variables** > **New
repository variable** `HML_ATIVO` = `true`. Sem ela o job "Deploy HML" fica pulado (só o CI roda), para
os pushes de antes da VPS não falharem.

Depois faça um push na `develop` (ou um commit vazio). Acompanhe em **Actions** > CI/CD > job
"Deploy HML". O primeiro leva mais tempo: baixa as imagens base e o Caddy emite o certificado curinga
(≈ 1–2 min; o script espera). Terminou verde = `https://hml.liderdeimpacto.com.br/api/saude` responde
`{"ok":true}`.

## Passo 10 — Criar o SUPER_ADMIN e o criador do Valmer (uma vez)

Sem senha em lugar nenhum: o seed cria as contas e imprime **links de primeiro acesso** (válidos 24 h);
cada pessoa escolhe a própria senha.

```bash
ssh deploy@IP_DA_VPS
cd /opt/lider-impacto
export IMAGEM_TAG=$(cat .tag-atual)
docker compose run --rm \
  -e SEED_SUPER_ADMIN_EMAIL=seu-email@exemplo.com \
  -e SEED_DONO_EMAIL=email-do-valmer@exemplo.com \
  -e SEED_DONO_NOME="Valmer Albuquerque" \
  ferramentas npm run -s db:seed
```

Saída: o criador **Líder de Impacto** (`lider-de-impacto`), um link para o SUPER_ADMIN
(`https://hml.../primeiro-acesso#token=...`) e um para o DONO (`https://lider-de-impacto.hml.../...`).

1. Abra o SEU link, defina a senha e cadastre o 2º fator (obrigatório para o SUPER_ADMIN).
2. Mande o link do Valmer **só para ele**, por canal privado.
3. Rodar de novo é seguro (não duplica) e gera links novos, invalidando os anteriores.

Outros criadores: entre em `https://hml.liderdeimpacto.com.br/plataforma` > novo criador.

## Passo 11 — Checklist de teste

- [ ] `https://hml.liderdeimpacto.com.br/api/saude` → `{"ok":true}`; cadeado válido no navegador
- [ ] `http://hml...` redireciona para `https://`
- [ ] Login do SUPER_ADMIN com 2º fator; `/plataforma` lista o criador
- [ ] `https://lider-de-impacto.hml.liderdeimpacto.com.br` abre o login da área do Valmer
- [ ] `https://nao-existe.hml.liderdeimpacto.com.br` → 404
- [ ] Admin do criador: criar curso, módulo, aula; subir capa (imagem aparece)
- [ ] Subir um vídeo curto na aula: "Processando" → "Pronto" em minutos; toca no player
- [ ] Subir legenda `.vtt`; material PDF baixa
- [ ] Matricular um aluno de teste, assistir, progresso salva; concluir gera certificado (PDF)
- [ ] Comunidade, evento ao vivo, assistente (se `ANTHROPIC_API_KEY` configurada)
- [ ] Na VPS: `docker compose ps` (com `export IMAGEM_TAG=$(cat .tag-atual)`) → tudo `healthy`

## Passo 12 — Backup no Cloudflare R2 (obrigatório antes de usar de verdade)

1. Cloudflare > **R2 Object Storage** (pede um cartão para ativar, mesmo no grátis) > **Create bucket**
   > nome `li-backups-hml`, localização automática, classe Standard. Bucket **privado** (não ligue
   "Public access" nem domínio público).
2. No bucket > **Settings** > **Object lifecycle rules** > Add rule (duas):
   - `diario-30d`: prefixo `banco/diario/` → **Delete objects** após **30 dias**;
   - `semanal-90d`: prefixo `banco/semanal/` → **Delete objects** após **90 dias**.
   (`storage/` não expira: é a cópia dos arquivos.)
3. R2 > **Manage R2 API Tokens** > **Create API token**: Permissions **Object Read & Write**;
   **Specify bucket(s)** = `li-backups-hml` (só ele); TTL sem fim; filtro de IP = IP da VPS
   (recomendado). Copie **Access Key ID**, **Secret Access Key** (aparece uma vez) e o endpoint
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
4. No `.env` da VPS: `R2_ENDPOINT`, `R2_BACKUP_BUCKET=li-backups-hml`, `R2_BACKUP_ACCESS_KEY_ID`,
   `R2_BACKUP_SECRET_ACCESS_KEY`.
5. Teste na hora (como `deploy`, em `/opt/lider-impacto`):
   ```bash
   ./backup.sh            # dump do banco + cópia do bucket lider-arquivos para o R2
   ./restaurar-teste.sh   # restaura o último dump num Postgres descartável e compara contagens
   ```
6. Agende (`crontab -e` como `deploy`; horário do servidor = UTC):
   ```
   30 6 * * *  /opt/lider-impacto/backup.sh >> /opt/lider-impacto/backup.log 2>&1
   0 8 1 * *   /opt/lider-impacto/restaurar-teste.sh >> /opt/lider-impacto/restauracao.log 2>&1
   ```
   Backup todo dia às 03:30 de Brasília; teste de restauração todo dia 1º.

O que vai: banco inteiro (diário 30 dias, semanal 90) e o bucket `lider-arquivos` (capas, materiais,
legendas, PDFs de certificado; cópia incremental). O que NÃO vai, na HML: vídeos (originais e HLS) —
são de teste, pesados, e o HLS é refeito do original (ADR-0015). O `backup.sh` recusa rodar sem os
`R2_*` e nada fica guardado na VPS.

---

## Se der errado

**Job vermelho no deploy.** Abra o log do passo que falhou. A versão anterior continua no ar até o
passo "app e workers"; se falhou ali, volte (abaixo). Comandos úteis na VPS:

```bash
cd /opt/lider-impacto && export IMAGEM_TAG=$(cat .tag-atual)
docker compose ps                          # quem está unhealthy
docker compose logs --tail 100 app         # ou caddy, worker-video, worker-certificados, db
```

**Voltar para a versão anterior (rollback):**

```bash
cd /opt/lider-impacto && ./implantar.sh "$(cat .tag-anterior)"
```

Migração só anda para a frente: o código anterior roda sobre o schema novo quando a migração é
aditiva (o padrão). Se não for, restaure o backup (abaixo).

**Sem cadeado / erro de certificado.** `docker compose logs caddy`. Causas comuns: registro `hml`/`*.hml`
apontando para outro IP, token da Cloudflare sem `Zone:DNS:Edit` da zona certa (ou com filtro de IP
errado), nameservers ainda não migrados.

**Restaurar o banco de verdade (perde o que foi gravado depois do dump):**

```bash
cd /opt/lider-impacto && export IMAGEM_TAG=$(cat .tag-atual)
mkdir -p /tmp/restauro
docker compose run --rm -v /tmp/restauro:/dados backup copyto r2:li-backups-hml/banco/diario/<arquivo>.sql.gz /dados/r.sql.gz
docker compose stop app worker-video worker-certificados
gzip -cd /tmp/restauro/r.sql.gz | docker compose exec -T db psql -q -v ON_ERROR_STOP=1 -U lider_migracao -d lider_impacto_hml
docker compose run --rm migrar             # reaplica as permissões da app
docker compose up -d --wait
rm -rf /tmp/restauro
```

Restaure como `lider_migracao` (dono), nunca como `postgres`: assim as tabelas continuam do dono certo
e as próximas migrações funcionam. Registre o incidente (o quê, quando, qual dump).

**Trocar uma senha do banco ou do Redis.** As senhas do banco só valem na criação do volume. Para trocar:
`docker compose exec db psql -U postgres -c "ALTER ROLE lider_app PASSWORD '<nova>'"`, atualize o
`.env` e rode `./implantar.sh "$(cat .tag-atual)"`. Redis e S3: atualize o `.env` e rode o mesmo comando.
**Nunca** troque `VIDEO_CHAVE_MESTRA` (exige rotação, `docs/back.md`).

**Disco cheio.** `df -h` e `docker system df`. O deploy já apaga imagens antigas (fica a atual e a
anterior). Vídeos de teste podem ser removidos pela tela do admin.

## Testar localmente antes de mexer no deploy

As imagens e o compose foram validados no Docker Desktop num projeto separado (`-p li-hml-teste`),
com um override que troca as portas do Caddy (8480/8443), usa `local_certs` no lugar do DNS-01 e
aponta `S3_ENDPOINT` para `http://storage:8333`. Derrube só esse projeto no fim:
`docker compose -p li-hml-teste down -v`.
