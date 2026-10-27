#!/usr/bin/env bash
# Backup da PRODUÇÃO no Cloudflare R2, FORA da VPS (regra de backup da base; ADR-0016/0017).
# Roda em duas imagens: `li-backup` (deploy/easypanel/backup.Dockerfile: postgres:16.15 + rclone) e
# `li-ferramentas` (deploy/docker/worker.Dockerfile: postgresql-client-16 + rclone), como `backup`.
#
#   backup                     (padrão do contêiner li-backup) espera BACKUP_HORA_UTC e roda todo dia
#   backup agora               roda uma vez já (teste; Shell do li-backup)
#   backup pre-deploy          (li-ferramentas, deploy/easypanel/ferramentas.sh) dump do banco em
#                              banco/pre-deploy/ ANTES de migrar; sai != 0 se falhar (aí não migra).
#                              Banco vazio (1º deploy: nenhuma tabela em public/drizzle) = nada a salvar.
#   backup restaurar-teste [prefixo]
#                              baixa o dump MAIS RECENTE de r2:<bucket>/<prefixo> (padrão banco/diario/),
#                              restaura num Postgres DESCARTÁVEL dentro deste contêiner e compara a
#                              contagem de tabelas-chave com o banco no ar. Não toca no banco no ar.
#                              Aceita o formato do Easypanel (pg_dump custom + gzip) e o deste script.
#                              Só no li-backup (precisa do servidor Postgres da imagem).
#   backup restaurar <caminho no R2> <nome do banco>
#                              RESTAURA DE VERDADE o banco no ar (destrói o estado atual). Antes, faz um
#                              dump de segurança em banco/pre-deploy/. Tudo numa transação: falhou, nada
#                              muda. Pare app e workers antes; depois, Deploy no li-ferramentas (runbook).
#
# O que o "rodar" faz:
#   1. Arquivos: cópia INCREMENTAL dos buckets `lider-arquivos` (capas, materiais, legendas, PDFs de
#      certificado), `lider-videos-originais` e `lider-hls` (refazer o HLS custa ~2 h de CPU por hora de
#      vídeo; com ele no R2, restaurar é só copiar) para
#      r2:<bucket>/storage/<bucket>/ (`rclone copy`: nunca apaga no destino).
#   2. Banco, com BACKUP_BANCO=1 (padrão da PRD): pg_dump no padrão da base (--no-owner --no-acl
#      --clean --if-exists), backup_DD_MM_YYYY_HH_MM.sql.gz, conferido, em banco/diario/ e, aos
#      domingos, banco/semanal/. Retenção = ciclo de vida do bucket no R2 (runbook).
#
# Variáveis (deploy/easypanel/env.exemplo): R2_ENDPOINT, R2_BACKUP_BUCKET, R2_BACKUP_ACCESS_KEY_ID,
# R2_BACKUP_SECRET_ACCESS_KEY, DATABASE_URL (dono do banco), e no li-backup S3_INTERNO, S3_CHAVE,
# S3_SEGREDO, BACKUP_HORA_UTC, BACKUP_BANCO. Nada fica no contêiner: os temporários são apagados.
set -euo pipefail

log() { echo "[backup $(date -u +%FT%TZ)] $*"; }
exigir() {
  local v
  for v in "$@"; do
    [[ -n "${!v:-}" ]] || { log "Recusado: $v vazio. Sem destino FORA da VPS não há backup."; exit 1; }
  done
}

exigir R2_ENDPOINT R2_BACKUP_BUCKET R2_BACKUP_ACCESS_KEY_ID R2_BACKUP_SECRET_ACCESS_KEY
# rclone lê os remotos do ambiente: r2 (destino) e sw (SeaweedFS do projeto, origem).
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_REGION=auto \
  RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT" \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_BACKUP_ACCESS_KEY_ID" \
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_BACKUP_SECRET_ACCESS_KEY" \
  RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
export RCLONE_CONFIG_SW_TYPE=s3 RCLONE_CONFIG_SW_PROVIDER=SeaweedFS \
  RCLONE_CONFIG_SW_ENDPOINT="${S3_INTERNO:-}" RCLONE_CONFIG_SW_ACCESS_KEY_ID="${S3_CHAVE:-}" \
  RCLONE_CONFIG_SW_SECRET_ACCESS_KEY="${S3_SEGREDO:-}"
BUCKET="$R2_BACKUP_BUCKET"
# Sem arquivo de configuração: tudo vem do ambiente (cala o aviso "rclone.conf not found").
export RCLONE_CONFIG=/dev/null

# Dump no padrão da base, conferido, e enviado a cada prefixo pedido (ex.: banco/diario).
despejar() {
  exigir DATABASE_URL
  local tmp nome bytes cabecalho p
  tmp="$(mktemp -d)"
  nome="backup_$(date +%d_%m_%Y_%H_%M).sql.gz"
  pg_dump "$DATABASE_URL" --no-owner --no-acl --clean --if-exists | gzip -9 > "$tmp/$nome"
  # Dump vazio "com sucesso" é a falha silenciosa clássica: só se descobre no dia do restore.
  bytes=$(wc -c < "$tmp/$nome")
  cabecalho="$(gzip -cd "$tmp/$nome" 2>/dev/null | head -c 4096 || true)"
  if [[ "$bytes" -lt 1024 || "$cabecalho" != *"PostgreSQL database dump"* ]] || ! gzip -t "$tmp/$nome"; then
    rm -rf "$tmp"; log "BACKUP SUSPEITO ($bytes bytes): não enviado."; return 1
  fi
  for p in "$@"; do rclone copyto "$tmp/$nome" "r2:$BUCKET/$p/$nome"; done
  rm -rf "$tmp"
  log "banco: $nome ($bytes bytes) enviado para $*"
}

rodar() {
  exigir S3_INTERNO S3_CHAVE S3_SEGREDO
  local b
  for b in lider-arquivos lider-videos-originais lider-hls; do
    rclone copy -M "sw:$b" "r2:$BUCKET/storage/$b" --stats-one-line --stats-log-level NOTICE
    log "arquivos: $b copiado (incremental)"
  done

  [[ "${BACKUP_BANCO:-0}" == "1" ]] || { log "banco: a cargo do backup do Easypanel (BACKUP_BANCO=0)"; return 0; }
  if [[ "$(date +%u)" == "7" ]]; then despejar banco/diario banco/semanal; else despejar banco/diario; fi
}

# Antes de migrar (li-ferramentas). Qualquer falha = sai != 0 = a migração NÃO roda (set -e).
pre_deploy() {
  exigir DATABASE_URL
  local tabelas
  tabelas="$(psql "$DATABASE_URL" -Atq -c "select count(*) from information_schema.tables where table_schema in ('public', 'drizzle')")"
  if [[ "$tabelas" == "0" ]]; then
    log "pre-deploy: banco vazio (1º deploy), nada a salvar"
    return 0
  fi
  despejar banco/pre-deploy
}

agendar() {
  local hora="${BACKUP_HORA_UTC:-06:30}" agora alvo
  [[ "$hora" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || { log "BACKUP_HORA_UTC inválida (HH:MM)."; exit 1; }
  log "agendado todo dia às $hora UTC"
  while true; do
    agora=$(date -u +%s)
    alvo=$(date -u -d "today $hora" +%s)
    (( alvo > agora )) || alvo=$(date -u -d "tomorrow $hora" +%s)
    sleep $(( alvo - agora ))
    # Falhou um dia: registra e tenta de novo amanhã (o restaurar-teste mensal pega o buraco).
    rodar || log "BACKUP FALHOU (veja as linhas acima)"
  done
}

restaurar_teste() {
  exigir DATABASE_URL
  local prefixo="${1:-banco/diario/}" ultimo sock arq rest no_ar
  # Global (não local): o trap de saída roda depois que a função já retornou.
  tmp="$(mktemp -d)"
  [[ "$prefixo" == */ ]] || prefixo="$prefixo/"
  # O mais recente pela data de modificação (o nome traz dia/mês/ano, não ordena).
  ultimo="$(rclone lsf --files-only --format tp --separator ';' "r2:$BUCKET/$prefixo" | sort | tail -n 1 | cut -d';' -f2)"
  [[ -n "$ultimo" ]] || { log "Nenhum arquivo em r2:$BUCKET/$prefixo"; exit 1; }
  sock="$tmp/sock"; arq="$tmp/dump"
  trap 'gosu postgres pg_ctl -D "$tmp/pg" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
  log "baixando $prefixo$ultimo"
  rclone copyto "r2:$BUCKET/$prefixo$ultimo" "$arq.bruto"
  if gzip -t "$arq.bruto" 2>/dev/null; then gzip -cd "$arq.bruto" > "$arq"; else mv "$arq.bruto" "$arq"; fi
  rm -f "$arq.bruto"

  log "Postgres descartável (só socket local, apagado no fim)"
  mkdir -p "$tmp/pg" "$sock" && chown -R postgres:postgres "$tmp"
  gosu postgres initdb -D "$tmp/pg" -U postgres -A trust >/dev/null
  gosu postgres pg_ctl -D "$tmp/pg" -o "-c listen_addresses='' -k $sock" -w start >/dev/null

  log "restaurando"
  if [[ "$(head -c 5 "$arq")" == "PGDMP" ]]; then
    # Formato custom (backup do Easypanel). Sem dono/permissões: o descartável não tem os papéis.
    gosu postgres pg_restore -h "$sock" -U postgres -d postgres --no-owner --no-acl --exit-on-error "$arq"
  else
    gosu postgres psql -h "$sock" -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f "$arq" >/dev/null
  fi

  local consulta="" t
  for t in usuarios criadores criadores_membros produtos produtos_modulos_aulas auditoria; do
    consulta+="select '$t', count(*) from $t;"$'\n'
  done
  rest="$(gosu postgres psql -h "$sock" -U postgres -d postgres -At -F ' ' <<<"$consulta")"
  no_ar="$(psql "$DATABASE_URL" -At -F ' ' <<<"$consulta")"
  echo "tabela restaurado no_ar   (o no ar pode ter crescido desde o dump)"
  paste -d ' ' <(echo "$rest") <(echo "$no_ar" | cut -d' ' -f2)
  [[ "$(echo "$rest" | awk '$1=="usuarios"{print $2}')" -gt 0 ]] || { log "FALHOU: restaurado sem usuários."; exit 1; }
  log "OK: $prefixo$ultimo restaurável."
}

# Restauração REAL (runbook "Restaurar o banco"). O 2º argumento confirma o banco (evita engano).
restaurar() {
  exigir DATABASE_URL
  local caminho="${1:-}" confirma="${2:-}" banco
  [[ -n "$caminho" && -n "$confirma" ]] || { echo "uso: backup restaurar <caminho no R2> <nome do banco>" >&2; exit 2; }
  banco="$(psql "$DATABASE_URL" -Atq -c "select current_database()")"
  [[ "$confirma" == "$banco" ]] || { log "Recusado: o banco no ar é \"$banco\", não \"$confirma\"."; exit 1; }
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  rclone copyto "r2:$BUCKET/$caminho" "$tmp/dump.sql.gz"
  gzip -t "$tmp/dump.sql.gz"
  log "cópia de segurança do estado atual antes de restaurar"
  despejar banco/pre-deploy
  log "restaurando $caminho em $banco (uma transação)"
  gzip -cd "$tmp/dump.sql.gz" | psql "$DATABASE_URL" -1 -q -v ON_ERROR_STOP=1 >/dev/null
  log "OK: $caminho restaurado. Agora: Deploy no li-ferramentas (permissões da app) e Start em app e workers."
}

case "${1:-agendar}" in
  agendar) agendar ;;
  agora) rodar ;;
  pre-deploy) pre_deploy ;;
  restaurar-teste) restaurar_teste "${2:-}" ;;
  restaurar) restaurar "${2:-}" "${3:-}" ;;
  *) echo "uso: backup [agendar|agora|pre-deploy|restaurar-teste [prefixo]|restaurar <caminho> <banco>]" >&2; exit 2 ;;
esac
