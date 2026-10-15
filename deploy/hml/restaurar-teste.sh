#!/usr/bin/env bash
# TESTE DE RESTAURAÇÃO (regra da base: "backup testado = restore executado com sucesso em HML").
# Baixa o dump MAIS RECENTE do R2, restaura num Postgres DESCARTÁVEL (contêiner temporário, sem rede,
# removido no fim) e compara a contagem de linhas de tabelas-chave com o banco no ar. Não toca no
# banco da HML. Rodar 1x por mês e depois de mexer no backup.sh.
#
#   ./restaurar-teste.sh
set -euo pipefail
cd "$(dirname "$0")"

ler() { grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
BUCKET="$(ler R2_BACKUP_BUCKET)"
DB_NOME="$(ler DB_NOME)"
[[ -n "$BUCKET" && -n "$DB_NOME" ]] || { echo "R2_BACKUP_BUCKET/DB_NOME vazios no .env." >&2; exit 1; }
export IMAGEM_TAG="${IMAGEM_TAG:-$(cat .tag-atual 2>/dev/null || echo 0000000)}"
dc() { docker compose --env-file .env "$@"; }

tmp="$(mktemp -d)"
temporario="li-restauracao-teste-$$"
trap 'docker rm -f "$temporario" >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT

# Nome traz dia/mês/ano: o mais recente sai pela data de modificação, não pela ordem alfabética.
ultimo="$(dc run --rm -T backup lsf --format tp --separator ';' "r2:$BUCKET/banco/diario/" | sort | tail -n 1 | cut -d';' -f2)"
[[ -n "$ultimo" ]] || { echo "Nenhum dump em r2:$BUCKET/banco/diario/." >&2; exit 1; }
echo "==> baixando $ultimo"
dc run --rm -T -v "$tmp:/dados" backup copyto "r2:$BUCKET/banco/diario/$ultimo" "/dados/$ultimo"

echo "==> Postgres descartável"
docker run -d --name "$temporario" --network none -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" postgres:16.15 >/dev/null
for _ in $(seq 1 60); do docker exec "$temporario" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break; sleep 1; done

echo "==> restaurando"
gzip -cd "$tmp/$ultimo" | docker exec -i "$temporario" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null

contar() { echo "select '$1', count(*) from $1;"; }
consulta="$(for t in usuarios criadores criadores_membros produtos produtos_modulos_aulas auditoria; do contar "$t"; done)"
echo "==> contagem (restaurado | no ar; o no ar pode ter crescido desde o dump)"
restaurado="$(docker exec -i "$temporario" psql -At -F ' ' -U postgres -d postgres <<<"$consulta")"
no_ar="$(dc exec -T db psql -At -F ' ' -U postgres -d "$DB_NOME" <<<"$consulta")"
paste <(echo "$restaurado") <(echo "$no_ar" | cut -d' ' -f2) | column -t
[[ "$(echo "$restaurado" | awk '$1=="usuarios"{print $2}')" -gt 0 ]] || { echo "FALHOU: restaurado sem usuários." >&2; exit 1; }
echo "OK: dump $ultimo restaurável."
