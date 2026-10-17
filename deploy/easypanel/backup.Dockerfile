# syntax=docker/dockerfile:1
# Imagem do serviço `li-backup` do Easypanel (ADR-0016/0017): pg_dump/psql/pg_restore do MESMO major do banco
# (16) + rclone. Contexto = deploy/easypanel. Construída pelo CI (GHCR, tag = SHA e `prd`).
#   docker build -f deploy/easypanel/backup.Dockerfile -t liderimpacto-backup deploy/easypanel
# Sem segredo em camada: R2_*, S3_* e DATABASE_URL chegam como variáveis do serviço.
FROM rclone/rclone:1.75.2 AS rclone

FROM postgres:16.15
COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
COPY --chmod=0755 backup.sh /usr/local/bin/backup
# root: o restaurar-teste sobe um Postgres descartável como `postgres` (gosu) dentro do contêiner.
ENTRYPOINT ["backup"]
CMD ["agendar"]
