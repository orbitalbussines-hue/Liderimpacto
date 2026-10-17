# ADR-0017: Produção direto, sem homologação

- **Status**: Aceito
- **Data**: 2026-10-17
- **Decisores**: Paulo (Bah! Tech)

## Contexto

A regra da base (`CLAUDE.md` da estrutura base, "Git Flow" e "Infraestrutura") manda: `develop` →
deploy em HML → validação → merge na `master` → deploy em PRD, com HML réplica de PRD. O ADR-0016
montou a HML no Easypanel da VPS Hostinger KVM 8. Em 17/10 o Paulo decidiu **não ter HML**: o projeto
`lideranca` do Easypanel foi recriado do zero e vira **produção**, nos domínios definitivos
(`lideresdeimpacto.com.br`, `www`, `<slug>.lideresdeimpacto.com.br`, `s3.lideresdeimpacto.com.br`). Já
existem `li-db` (Postgres 16.15, banco `lider_impacto`), `li-redis` (Redis pronto do Easypanel) e
`li-storage` (SeaweedFS). A página de vendas sai desse projeto e volta depois em outro.

Por que o Paulo decidiu assim: um único criador no início (Valmer), poucos usuários na largada, custo
e operação de um segundo ambiente idêntico, e o desenho do deploy já tem as travas que a HML dava em
parte (CI obrigatório, imagem testada, saúde por versão do schema, voltar versão com um clique).

## Decisão

1. **Desvio consciente da regra "HML antes de PRD"**: o único ambiente no ar é a produção. A `develop`
   roda só o CI; a `master` faz o deploy de PRD (`.github/workflows/deploy.yml`, job `deploy-prd`). O
   job `deploy-hml` e o `voltar-hml` saíram (sem HML, ficariam mortos e a tag `hml` nunca seria
   puxada); o equivalente de PRD é o `voltar-prd`. Recriar a HML = ADR-0016 + histórico do git.
2. **Pipeline de PRD**: push/merge na `master` → CI → imagens no GHCR (tag do SHA + tag móvel `prd`,
   `VERSAO_IMAGEM` = SHA gravada nas imagens) → gatilhos do Easypanel (`li-ferramentas` primeiro,
   depois `li-app`, `li-worker-video`, `li-worker-certificados`, `li-backup`) → conferência de
   `https://lideresdeimpacto.com.br/api/saude`. Environment `prd` com os secrets
   `EASYPANEL_DEPLOY_WEBHOOK_*`; a variável `PRD_ATIVO=true` liga os gatilhos (sem ela, só publica as
   imagens e avisa); `PRD_S3_ENDPOINT` troca o host público do storage do build.
3. **Backup ANTES de cada deploy (regra absoluta da base), feito de dentro da VPS**: o CI não alcança
   o banco. O `li-ferramentas` roda `deploy/easypanel/ferramentas.sh`: `backup pre-deploy`
   (`deploy/easypanel/backup.sh`: `pg_dump` 16 no padrão da base, `--no-owner --no-acl --clean
   --if-exists`, `backup_DD_MM_YYYY_HH_MM.sql.gz`, conferido, para o R2 em `banco/pre-deploy/`) →
   migração → buckets. Backup falhou = não migra e espera 5 min antes de sair (o reinício automático
   não martela o banco). Banco vazio (nenhuma tabela em `public`/`drizzle`, o 1º deploy) = nada a
   salvar, segue; não há variável de escape. A imagem `worker` ganhou `postgresql-client-16` (PGDG; o
   17 do Debian gera dump que o 16 não restaura) e `rclone`.
4. **Nenhuma versão nova entra no ar sem esse backup, nem a que não tem migração**: no fim da
   migração o `scripts/db-migrar.ts` grava `implantacao:<sha>` no `COMMENT` do banco. O `/api/saude`
   (healthcheck do app) e o `aguardarEsquema` dos workers só liberam a versão cuja marca está lá
   (`src/lib/db/migracoes.ts`); uma vez liberado, o processo segue liberado (a versão anterior não cai
   quando a nova grava a marca dela). Sem `VERSAO_IMAGEM` (dev, CI) não há trava. Healthcheck das
   imagens com `start-period` de 15 min: esperar o backup não conta como falha.
5. **Backups da PRD**: `li-backup` todo dia faz o dump em `banco/diario/` (e domingo `banco/semanal/`,
   `BACKUP_BANCO=1`) e copia `lider-arquivos` **e `lider-videos-originais`** para `storage/` (vídeo é
   conteúdo real agora; o HLS se refaz do original). Retenção pelo ciclo de vida do bucket
   `li-backups-prd`: diário 30 d, semanal 90 d, pre-deploy 90 d, `storage/` sem expirar.
   `backup restaurar-teste [prefixo]` restaura num Postgres descartável; `backup restaurar <caminho>
   <banco>` restaura de verdade (confere o nome, faz cópia do estado atual, uma transação só).
6. **Nada de dado de demonstração**: o único seed é o `db:seed` (super admin + criador do Valmer por
   link de primeiro acesso). `seed:demo`, `seed:demo:*` e `sessao:demo` já recusavam
   `NODE_ENV=production` e banco fora do localhost; o `seed:demo` passou a recusar já no carregamento.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Bug chega direto ao aluno (não há ambiente para o Valmer validar antes) | CI obrigatório na `master` (auditor, lint, tipos, testes com Postgres real, build); proteção da `master` exigindo o CI; mudança grande validada antes no compose local de teste (imagens reais, banco com os papéis de PRD) |
| Migração estraga dado | Backup pre-deploy obrigatório, travado no código; migrações só aditivas (coluna nova, tabela nova; renomear/remover em dois deploys); `backup restaurar` em uma transação |
| Backup que não restaura | `restaurar-teste` antes de abrir para alunos e todo dia 1º; dump conferido (tamanho, cabeçalho, gzip) antes de enviar |
| Versão ruim no ar | `voltar-prd` (tag `prd` num SHA anterior, com backup antes); a versão anterior segue atendendo até a nova ficar saudável |
| Domínio definitivo desde o 1º dia | Runbook confere apex, `www`, MX/SPF/DKIM antes; o curinga não afeta registros existentes; aviso do HSTS com `includeSubDomains` |
| Teste manual em PRD deixa lixo | Checklist manda testar com contas suas e excluir (soft delete) o curso/aluno de teste |

## Quando criar uma HML

Ao entrar o 2º criador pagante; quando houver alunos pagantes em volume (centenas ativos); antes de
mudanças de alto risco (troca de versão do Better Auth/Next, migração que transforma dado, integração
de pagamento/webhook do gateway); ou quando outra pessoa além do Paulo passar a publicar. Criar = outro
projeto no Easypanel com as mesmas imagens (ADR-0016), a `develop` voltando a disparar o deploy dela.

## Alternativas Consideradas

- **Manter a HML do ADR-0016 antes da PRD**: o caminho da base; o Paulo recusou pelo custo/operação
  na largada. Fica como passo futuro (acima).
- **Backup pelo CI (SSH na VPS + `pg_dump`)**: exigiria abrir SSH ao GitHub e guardar chave lá; o
  Easypanel não tem job de pré-deploy. Fazer no `li-ferramentas` mantém o dump dentro da VPS → R2.
- **Só "recusar migrar" sem a marca da versão**: deploy só de código entraria no ar mesmo com o
  backup falhando. A marca no `COMMENT` do banco não precisa de tabela nem migração.
- **Backup pela aba Backups do Easypanel**: formato próprio, agenda pode exigir licença, e não roda
  "antes do deploy". Fica opcional.
- **Variável de escape para pular o backup**: dispensada; banco vazio é detectado.

## Consequencias

### Positivas
- Todo deploy de PRD tem um dump no R2 feito segundos antes, e nenhuma versão nova atende sem ele.
- Voltar versão e restaurar o banco são um clique / um comando, testados localmente.

### Negativas / Trade-offs
- Sem HML, o primeiro lugar onde o Valmer vê uma mudança é a produção.
- Cada deploy custa um dump do banco (segundos hoje; com banco grande, o `start-period` de 15 min
  vira o teto e precisa subir).
- Imagem `worker` maior (cliente do Postgres 16 + rclone).
- A conferência do CI vê "site no ar", não "versão nova no ar" (a troca se vê em Deployments e no
  log `[migrar] versão <sha> liberada`).

### Neutras
- `deploy/hml/` (compose, ADR-0015) e `docs/deploy-hml.md` continuam como referência para uma HML
  futura numa VPS dedicada; o CI não publica mais a imagem do Caddy nem a tag `hml`.
