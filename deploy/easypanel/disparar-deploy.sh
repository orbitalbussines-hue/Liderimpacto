#!/usr/bin/env bash
# Chamado pelo CI (jobs deploy-hml e voltar-hml) DEPOIS das imagens publicadas com a tag `hml`:
# chama a "Deployment Trigger URL" de cada serviço do Easypanel (aba Deployments; a URL contém um
# segredo e fica só nos secrets do environment `hml`). Ordem: `ferramentas` primeiro (migra o banco);
# app e workers sobem em seguida e esperam o schema em dia (saúde 503 / aguardarEsquema, ADR-0016).
# A doc do Easypanel não diz o método HTTP: tenta POST e, se recusado, GET. Nunca imprime a URL.
#
# Nenhum secret ainda (1º push, antes de criar os serviços no Easypanel): só avisa e escreve
# `disparado=false` no GITHUB_OUTPUT (as imagens já foram publicadas). Alguns sim e outros não: erro.
set -euo pipefail

SERVICOS=(FERRAMENTAS APP WORKER_VIDEO WORKER_CERTIFICADOS BACKUP)
saida="${GITHUB_OUTPUT:-/dev/null}"

faltam=()
for nome in "${SERVICOS[@]}"; do
  var="EASYPANEL_DEPLOY_WEBHOOK_$nome"
  [[ -n "${!var:-}" ]] || faltam+=("$var")
done
if [[ ${#faltam[@]} -eq ${#SERVICOS[@]} ]]; then
  echo "::warning::Nenhum EASYPANEL_DEPLOY_WEBHOOK_* configurado: imagens publicadas, deploy NÃO disparado (docs/deploy-easypanel.md)."
  echo "disparado=false" >> "$saida"
  exit 0
fi
if [[ ${#faltam[@]} -gt 0 ]]; then
  echo "::error::secrets ausentes no environment hml: ${faltam[*]}"
  exit 1
fi

for nome in "${SERVICOS[@]}"; do
  var="EASYPANEL_DEPLOY_WEBHOOK_$nome"
  url="${!var}"
  if ! curl -fsS -X POST --max-time 30 -o /dev/null "$url" 2>/dev/null; then
    curl -fsS --max-time 30 -o /dev/null "$url" || { echo "::error::deploy de $nome recusado pelo Easypanel"; exit 1; }
  fi
  echo "deploy de $nome disparado"
done
echo "disparado=true" >> "$saida"
