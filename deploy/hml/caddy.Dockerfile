# syntax=docker/dockerfile:1
# Caddy com o módulo DNS da Cloudflare (desafio DNS-01 = certificado CURINGA *.hml.<domínio>).
# Versões FIXADAS: subir uma delas é mudança revisada, não efeito colateral do build. O Caddyfile
# NÃO entra na imagem: vem montado de /opt/lider-impacto (copiado pelo deploy a cada versão).
#   docker build -f deploy/hml/caddy.Dockerfile deploy/hml
ARG CADDY_VERSAO=2.11.7

FROM caddy:${CADDY_VERSAO}-builder AS build
ARG CADDY_DNS_CLOUDFLARE=v0.2.4
RUN xcaddy build --with github.com/caddy-dns/cloudflare@${CADDY_DNS_CLOUDFLARE}

FROM caddy:${CADDY_VERSAO}
COPY --from=build /usr/bin/caddy /usr/bin/caddy
