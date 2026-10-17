#!/usr/bin/env bash
# Comando do serviço `li-ferramentas` (imagem worker, ADR-0016/0017). A cada deploy de PRODUÇÃO:
#   1. `backup pre-deploy`: pg_dump do banco para o R2 em banco/pre-deploy/ (deploy/easypanel/backup.sh).
#      Falhou = PARA AQUI: nada é migrado e a versão nova não é liberada (regra da base: nunca deploy
#      em PRD sem backup). Banco vazio (1º deploy) = nada a salvar, segue.
#   2. migração como dono do banco (scripts/db-migrar.ts, com trava); no fim grava a marca da versão
#      no banco, que libera o app e os workers novos (src/lib/db/migracoes.ts);
#   3. buckets + CORS do storage (idempotente);
#   4. fica parado (healthy pelo SAUDE_ARQUIVO). O Shell dele é onde se roda o seed manual.
# Falha em qualquer passo: espera 5 min antes de sair, para o reinício automático do Swarm não
# martelar o banco com um dump a cada poucos segundos.
set -uo pipefail

if backup pre-deploy && node --import tsx scripts/db-migrar.ts && npm run -s armazenamento:preparar; then
  exec sleep infinity
fi
echo "[ferramentas] FALHOU (veja as linhas acima). A versão nova NÃO foi liberada; nova tentativa em 5 min." >&2
sleep 300
exit 1
