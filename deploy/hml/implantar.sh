#!/usr/bin/env bash
# Implanta UMA versão na VPS de HML (ADR-0015). Chamado pelo CI a cada push na develop e usado à mão
# para voltar à versão anterior:
#
#   ./implantar.sh <sha>                       # versão = SHA do commit (tag das imagens no GHCR)
#   ./implantar.sh "$(cat .tag-anterior)"      # rollback
#
# Ordem (falhou um passo, para ali; a versão no ar continua a anterior até o passo 4):
#   1. baixa as imagens da versão
#   2. sobe/garante banco, Redis, storage e Caddy (com healthcheck)
#   3. MIGRA o banco (scripts/db-migrar.ts como dono do banco) e prepara buckets + CORS
#   4. troca app e workers pela versão nova e espera ficarem saudáveis
#   5. registra a versão (.tag-atual / .tag-anterior) e apaga imagens velhas (fica atual + anterior)
set -euo pipefail
cd "$(dirname "$0")"

TAG="${1:-}"
if [[ ! "$TAG" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "uso: ./implantar.sh <sha do commit>" >&2
  exit 2
fi
[[ -f .env ]] || { echo "Falta /opt/lider-impacto/.env (docs/deploy-hml.md, passo 7)." >&2; exit 1; }

export IMAGEM_TAG="$TAG"
dc() { docker compose --env-file .env "$@"; }

echo "==> 1/5 imagens $TAG"
dc --profile ferramentas pull --quiet

echo "==> 2/5 dados e borda"
dc up -d --wait --wait-timeout 240 db redis storage caddy

echo "==> 3/5 migração e buckets"
dc run --rm migrar
# Na 1ª vez o Caddy ainda está emitindo o certificado (DNS-01 leva ~1 min): tenta por até 3 min.
for tentativa in $(seq 1 18); do
  if dc run --rm ferramentas; then break; fi
  [[ $tentativa -eq 18 ]] && { echo "Buckets/CORS falharam (o s3.<domínio> responde?)." >&2; exit 1; }
  sleep 10
done

echo "==> 4/5 app e workers"
dc up -d --wait --wait-timeout 300 --remove-orphans

echo "==> 5/5 registro e limpeza"
anterior="$(cat .tag-atual 2>/dev/null || true)"
if [[ -n "$anterior" && "$anterior" != "$TAG" ]]; then echo "$anterior" > .tag-anterior; fi
echo "$TAG" > .tag-atual
manter="$TAG|$(cat .tag-anterior 2>/dev/null || echo "$TAG")"
docker image ls --format '{{.Repository}}:{{.Tag}}' \
  | grep -E '^ghcr\.io/orbitalbussines-hue/liderimpacto-(app|worker|caddy):' \
  | grep -Ev ":($manter)\$" \
  | xargs -r docker image rm >/dev/null 2>&1 || true

dc ps --format 'table {{.Service}}\t{{.Status}}'
echo "Versão $TAG no ar."
