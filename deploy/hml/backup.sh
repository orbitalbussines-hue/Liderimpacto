#!/usr/bin/env bash
# Backup da HML para o Cloudflare R2 (FORA da VPS; regra de backup da base). Cron diário (docs/deploy-hml.md):
#
#   30 6 * * *  /opt/lider-impacto/backup.sh >> /opt/lider-impacto/backup.log 2>&1   (06:30 UTC = 03:30 BRT)
#
# 1. Banco: pg_dump no padrão da base (--no-owner --no-acl --clean --if-exists), nome
#    backup_DD_MM_YYYY_HH_MM.sql.gz, conferido (tamanho e cabeçalho) e enviado para
#    r2:<bucket>/banco/diario/ — e, aos domingos, também para banco/semanal/.
#    Retenção (diário 30 dias, semanal 90) = REGRA DE CICLO DE VIDA do bucket no R2, por prefixo.
#    O script não apaga nada no R2.
# 2. Storage: cópia INCREMENTAL do bucket `lider-arquivos` (capas, thumbs, materiais, legendas .vtt,
#    PDFs de certificado) para r2:<bucket>/storage/lider-arquivos/ (`rclone copy`: nunca apaga no
#    destino). Vídeos (originais e HLS) ficam de fora na HML: são de teste, grandes, e o HLS é
#    refeito do original (ADR-0015).
#
# Recusa rodar sem destino configurado (R2_* no .env). Nada fica na VPS: o dump é apagado no fim.
set -euo pipefail
cd "$(dirname "$0")"

ler() { grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
for v in R2_ENDPOINT R2_BACKUP_BUCKET R2_BACKUP_ACCESS_KEY_ID R2_BACKUP_SECRET_ACCESS_KEY DB_NOME; do
  if [[ -z "$(ler "$v")" ]]; then
    echo "Recusado: $v vazio no .env. Sem destino FORA da VPS não há backup (docs/deploy-hml.md, passo 12)." >&2
    exit 1
  fi
done
BUCKET="$(ler R2_BACKUP_BUCKET)"
DB_NOME="$(ler DB_NOME)"
export IMAGEM_TAG="${IMAGEM_TAG:-$(cat .tag-atual 2>/dev/null || echo 0000000)}"
dc() { docker compose --env-file .env "$@"; }

nome="backup_$(date +%d_%m_%Y_%H_%M).sql.gz"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "[$(date -Is)] dump de $DB_NOME"
dc exec -T db pg_dump -U postgres --no-owner --no-acl --clean --if-exists "$DB_NOME" | gzip -9 > "$tmp/$nome"

# Dump vazio "com sucesso" é a falha silenciosa clássica: só se descobre no dia do restore.
bytes=$(wc -c < "$tmp/$nome")
# `|| true`: o head fecha o cano antes do fim e o gzip sai com SIGPIPE (pipefail o contaria como erro).
cabecalho="$(gzip -cd "$tmp/$nome" 2>/dev/null | head -c 4096 || true)"
if [[ "$bytes" -lt 1024 || "$cabecalho" != *"PostgreSQL database dump"* ]] || ! gzip -t "$tmp/$nome"; then
  echo "BACKUP SUSPEITO ($bytes bytes): não enviado." >&2
  exit 1
fi

rcl() { dc run --rm -T -v "$tmp:/dados:ro" backup "$@"; }
rcl copyto "/dados/$nome" "r2:$BUCKET/banco/diario/$nome"
if [[ "$(date +%u)" == "7" ]]; then
  rcl copyto "/dados/$nome" "r2:$BUCKET/banco/semanal/$nome"
fi
echo "[$(date -Is)] banco: $nome ($bytes bytes) enviado"

rcl copy sw:lider-arquivos "r2:$BUCKET/storage/lider-arquivos" --stats-one-line --stats-log-level NOTICE
echo "[$(date -Is)] storage: lider-arquivos sincronizado (incremental)"
