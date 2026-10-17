-- Bootstrap dos papéis do banco de PRODUÇÃO no EASYPANEL (ADR-0016/0017; já rodado no li-db em
-- 17/10). Roda UMA vez, à mão, no console do serviço `li-db`: Overview > Shell > psql (entra como
-- `postgres`). Cole bloco a bloco. Nenhuma senha aqui: o \password pede a senha e a guarda já
-- cifrada (não fica no histórico nem no log).
-- Equivale ao deploy/hml/postgres-init.sh do compose (ADR-0015):
--   postgres        superusuário do Easypanel: manutenção e backup; a app NUNCA usa.
--   lider_migracao  DONO do banco: roda as migrações (serviço ferramentas). Cria a extensão
--                   `unaccent` (migração 0011) sem superusuário: ela é "trusted" no PG 13+.
--   lider_app       app e workers: só DML (GRANTs reaplicados a cada migração), sem DDL, sem
--                   UPDATE/DELETE na trilha de auditoria e no razão de pontos.

-- 1. Conferir: versão 16 e o postgres é superusuário (coluna "Attributes" com Superuser).
select version();
\du

-- 2. Papéis (sem senha ainda).
CREATE ROLE lider_migracao LOGIN;
CREATE ROLE lider_app LOGIN;

-- 3. Senhas: cole a DB_MIGRACAO_SENHA e depois a DB_APP_SENHA quando pedir (duas vezes cada).
\password lider_migracao
\password lider_app

-- 4. O banco (criado pelo Easypanel com o nome lider_impacto) passa a ser do lider_migracao.
ALTER DATABASE lider_impacto OWNER TO lider_migracao;
REVOKE ALL ON DATABASE lider_impacto FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE lider_impacto TO lider_app;

-- 5. Dentro do banco: PostgreSQL 15+ dá o schema public ao dono do banco; a app só usa.
\c lider_impacto
GRANT USAGE ON SCHEMA public TO lider_app;

-- 6. Conferir: Owner = lider_migracao.
\l lider_impacto
