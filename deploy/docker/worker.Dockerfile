# syntax=docker/dockerfile:1
# Imagem dos WORKERS e das FERRAMENTAS de deploy (uma imagem, comando por serviço no compose/Easypanel):
#   worker de vídeo ......... node --conditions=react-server --import tsx scripts/worker-video.ts
#   worker de certificados .. (filas certificados, eventos e conhecimento) scripts/worker-certificados.ts
#   migração ................ scripts/db-migrar.ts (antes da versão nova; no Easypanel, serviço ferramentas)
#   buckets + CORS .......... npm run armazenamento:preparar
#   li-ferramentas (PRD) .... ferramentas = backup pré-deploy no R2 -> migração -> buckets (ADR-0017)
#   primeiro acesso ......... npm run db:seed (MANUAL, nunca no entrypoint)
# Contexto = raiz do repositório. Sem segredo em camada: tudo chega por variável no `docker run`.

ARG NODE_IMAGEM=node:24.12.0-trixie-slim

FROM rclone/rclone:1.75.2 AS rclone

FROM ${NODE_IMAGEM} AS base
WORKDIR /app
COPY package.json package-lock.json ./

# O lockfile marca o binário do esbuild (@esbuild/<plataforma>) como dev, mas o tsx (que roda os
# scripts .ts sem compilar) é dependência de produção e precisa dele. Vem desta instalação completa,
# na versão exata do lockfile. --ignore-scripts: ver app.Dockerfile.
FROM base AS deps-completas
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM base AS deps
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --from=deps-completas /app/node_modules/@esbuild ./node_modules/@esbuild

FROM ${NODE_IMAGEM} AS worker
# FFmpeg/ffprobe da distribuição (Debian trixie: 7.x). O worker roda o FFmpeg com prioridade baixa
# (src/lib/video/processar.ts) e o compose limita CPU e memória do contêiner.
# pg_dump/psql do MESMO major do banco (16, repositório oficial PGDG; o 17 da distribuição gera dump
# que o 16 não restaura) + rclone: backup pré-deploy do li-ferramentas (deploy/easypanel/backup.sh).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates postgresql-common \
 && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
 && apt-get install -y --no-install-recommends postgresql-client-16 \
 && rm -rf /var/lib/apt/lists/*
COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
COPY --chmod=0755 deploy/easypanel/backup.sh /usr/local/bin/backup
COPY --chmod=0755 deploy/easypanel/ferramentas.sh /usr/local/bin/ferramentas
# SHA do commit (build-arg do CI). O li-ferramentas grava a marca desta versão no banco depois do
# backup + migração; os workers só começam com ela (src/lib/db/migracoes.ts). Vazio = sem trava.
ARG VERSAO_IMAGEM=
ENV NODE_ENV=production \
    VERSAO_IMAGEM=${VERSAO_IMAGEM}
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY scripts ./scripts
# O worker de vídeo escreve no diretório temporário do sistema (/tmp), não em /app.
USER node
# Healthcheck NA IMAGEM (o Easypanel/Swarm usa este; o compose da HML define o mesmo): PING no Redis
# da fila, ou, no serviço `ferramentas` (SAUDE_ARQUIVO), backup + migração terem terminado.
# start-period de 15 min: o li-ferramentas faz o pg_dump antes de migrar e não pode ser morto no meio
# (ponytail: banco que leve mais de ~15 min para dump pede aumentar isto). Workers ficam healthy no 1º PING.
HEALTHCHECK --interval=30s --timeout=10s --start-period=15m --retries=3 CMD ["node", "scripts/worker-saude.mjs"]
CMD ["node", "--conditions=react-server", "--import", "tsx", "scripts/worker-certificados.ts"]
