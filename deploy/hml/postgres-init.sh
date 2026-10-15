#!/bin/sh
# Bootstrap do banco da HML — roda UMA vez, pelo próprio contêiner do Postgres, quando o volume
# está vazio (/docker-entrypoint-initdb.d). Nunca roda de novo nem em deploy. Nenhuma senha aqui:
# vêm do .env do servidor pelo compose.
#
# Três papéis (ADR-0015):
#   postgres        superusuário (POSTGRES_PASSWORD): só manutenção e pg_dump; a app nunca usa.
#   lider_migracao  DONO do banco: roda as migrações (scripts/db-migrar.ts). Cria a extensão
#                   `unaccent` da migração 0011 sem superusuário: ela é "trusted" no PostgreSQL 13+
#                   e o dono do banco tem CREATE nele.
#   lider_app       a aplicação e os workers: só DML (GRANTs reaplicados a cada migração), sem DDL,
#                   sem UPDATE/DELETE na trilha de auditoria e no razão de pontos.
set -eu

: "${DB_NOME:?}" "${DB_MIGRACAO_SENHA:?}" "${DB_APP_SENHA:?}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v nome="$DB_NOME" -v senha_migracao="$DB_MIGRACAO_SENHA" -v senha_app="$DB_APP_SENHA" <<'SQL'
CREATE ROLE lider_migracao LOGIN PASSWORD :'senha_migracao';
CREATE ROLE lider_app LOGIN PASSWORD :'senha_app';
CREATE DATABASE :"nome" OWNER lider_migracao;
REVOKE ALL ON DATABASE :"nome" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"nome" TO lider_app;
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$DB_NOME" <<'SQL'
-- PostgreSQL 15+: o schema public já é do dono do banco e só ele cria objetos nele.
GRANT USAGE ON SCHEMA public TO lider_app;
SQL

echo "[init] banco $DB_NOME criado (dono lider_migracao; app lider_app)."
