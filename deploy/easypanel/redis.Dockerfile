# syntax=docker/dockerfile:1
# Serviço `redis` do Easypanel (ADR-0016) — COLE este conteúdo em App > Source > Dockerfile.
# Por que não o Redis "gerenciado" do Easypanel: a doc não diz como ligar AOF nem noeviction, e o
# Easypanel não tem campo de healthcheck (o Swarm usa o HEALTHCHECK da imagem).
# Fila BullMQ: AOF ligado (job não vive só em memória), noeviction (exigência do BullMQ), teto de
# memória abaixo do limite do serviço (768 MB) e senha da variável REDIS_SENHA do serviço.
FROM redis:7.4.11
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD ["sh", "-c", "REDISCLI_AUTH=\"$REDIS_SENHA\" redis-cli ping | grep -q PONG"]
CMD ["sh", "-c", "test -n \"$REDIS_SENHA\" || { echo 'REDIS_SENHA vazia' >&2; exit 1; }; exec docker-entrypoint.sh redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy noeviction --requirepass \"$REDIS_SENHA\""]
