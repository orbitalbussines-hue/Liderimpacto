# syntax=docker/dockerfile:1
# Imagem do APP (Next 16 em modo standalone). Contexto = raiz do repositório (.dockerignore tira
# .env, .git, node_modules, docs...). Nenhum segredo entra em camada: o build usa valores de MENTIRA
# só para compilar (o auth.ts recusa subir sem segredo) e o segredo real chega no `docker run`.
#
#   docker build -f deploy/docker/app.Dockerfile \
#     --build-arg S3_ENDPOINT=https://s3.liderdeimpacto.com.br -t liderimpacto-app .
#
# S3_ENDPOINT/S3_BUCKET_ARQUIVOS NÃO são segredo: o next.config.ts os lê no BUILD para liberar o
# host do storage no otimizador de imagens (o config é serializado no standalone). Mudou o host
# público do storage = imagem nova (ADR-0015).

ARG NODE_IMAGEM=node:24.12.0-trixie-slim

FROM ${NODE_IMAGEM} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: o `prepare` liga git hooks (não há git aqui) e nenhum pacote do app precisa de
# script de instalação (sharp e esbuild vêm em binário pré-compilado por optionalDependencies).
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM deps AS build
ARG S3_ENDPOINT
ARG S3_BUCKET_ARQUIVOS=lider-arquivos
ARG S3_FORCAR_CAMINHO=true
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN test -n "$S3_ENDPOINT" || (echo "build-arg S3_ENDPOINT obrigatório (host público do storage)" && exit 1)
RUN BETTER_AUTH_SECRET=valor-de-mentira-so-para-compilar-0123456789abcdef \
    BETTER_AUTH_URL=https://compilacao.invalido \
    PLATAFORMA_DOMINIO=compilacao.invalido \
    npm run build

FROM ${NODE_IMAGEM} AS app
# SHA do commit (build-arg do CI): o app só fica saudável depois que o li-ferramentas gravou a marca
# desta versão no banco = backup pré-deploy + migração feitos (src/lib/db/migracoes.ts, ADR-0017).
ARG VERSAO_IMAGEM=
ENV NODE_ENV=production     VERSAO_IMAGEM=${VERSAO_IMAGEM} \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
# Código e dependências de root (o processo não altera o próprio código); só .next é do usuário
# `node` (cache do otimizador de imagens e do "use cache").
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/public ./public
COPY --from=build --chown=node:node /app/.next/static ./.next/static
RUN chown -R node:node /app/.next
USER node
EXPOSE 3000
# Healthcheck NA IMAGEM: o Easypanel (Docker Swarm) não tem campo de healthcheck e usa este; o
# Swarm só põe a versão nova no ar depois do 1º "healthy" (503 até o banco estar migrado e, em PRD,
# até o backup pré-deploy, ADR-0016/0017). start-period de 15 min (= o do li-ferramentas): esperar
# por ele não conta como falha; o 1º 200 já libera. O compose da HML define o mesmo teste (ADR-0015).
HEALTHCHECK --interval=15s --timeout=5s --start-period=15m --retries=5   CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/saude').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "server.js"]
