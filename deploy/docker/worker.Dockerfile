# syntax=docker/dockerfile:1
# Imagem dos WORKERS e das FERRAMENTAS de deploy (uma imagem, comando por serviço no compose/Easypanel):
#   worker de vídeo ......... node --conditions=react-server --import tsx scripts/worker-video.ts
#   worker de certificados .. (filas certificados, eventos e conhecimento) scripts/worker-certificados.ts
#   migração ................ scripts/db-migrar.ts (antes da versão nova; no Easypanel, serviço ferramentas)
#   buckets + CORS .......... npm run armazenamento:preparar
#   primeiro acesso ......... npm run db:seed (MANUAL, nunca no entrypoint)
# Contexto = raiz do repositório. Sem segredo em camada: tudo chega por variável no `docker run`.

ARG NODE_IMAGEM=node:24.12.0-trixie-slim

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
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY scripts ./scripts
# O worker de vídeo escreve no diretório temporário do sistema (/tmp), não em /app.
USER node
# Healthcheck NA IMAGEM (o Easypanel/Swarm usa este; o compose da HML define o mesmo): PING no Redis
# da fila, ou, no serviço `ferramentas` (SAUDE_ARQUIVO), a migração ter terminado.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 CMD ["node", "scripts/worker-saude.mjs"]
CMD ["node", "--conditions=react-server", "--import", "tsx", "scripts/worker-certificados.ts"]
