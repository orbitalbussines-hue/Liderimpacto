# syntax=docker/dockerfile:1
# Serviço `storage` (SeaweedFS, API S3) do Easypanel (ADR-0016) — COLE este conteúdo em
# App > Source > Dockerfile. Mesma versão do dev e do compose da HML. Só a API S3 (8333) é publicada,
# pelo domínio s3.lideresdeimpacto.com.br do Traefik. A credencial vem das variáveis S3_CHAVE/S3_SEGREDO do serviço
# e vira o s3.json em /tmp na subida (nada em camada).
# /data TEM de ser Montagem de Volume do Easypanel (Montagens > Volume, caminho /data). A imagem declara
# VOLUME /data: sem montagem, o Swarm cria um volume anônimo por contêiner e cada Implantar/reinício
# começa VAZIO (perdemos arquivos assim em 23/10). A subida recusa /data sem volume nomeado.
# Uma instância só por volume (flock em /data/.instancia): duas ao mesmo tempo travam o filer (leveldb).
# No Easypanel, Zero Downtime DESLIGADO (para a antiga antes de subir a nova). `-ip=127.0.0.1`: o IP do
# contêiner muda a cada tarefa do Swarm; master/volume/filer conversam por localhost, endereço estável.
FROM chrislusf/seaweedfs:4.48
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD ["sh", "-c", "wget -q -O /dev/null http://127.0.0.1:8333/healthz"]
ENTRYPOINT ["/bin/sh", "-c"]
CMD ["umask 077 && raiz=$(awk '$5==\"/data\"{print $4}' /proc/self/mountinfo) && { [ -n \"$raiz\" ] && ! echo \"$raiz\" | grep -Eq '/volumes/[0-9a-f]{64}/_data$' || { echo 'RECUSADO: /data sem Montagem de Volume (Easypanel > Montagens > Volume em /data). Sem ela, reiniciar apaga todos os arquivos.' >&2; exit 1; }; } && test -n \"$S3_CHAVE\" && test -n \"$S3_SEGREDO\" && printf '{\"identities\":[{\"name\":\"lider-app\",\"credentials\":[{\"accessKey\":\"%s\",\"secretKey\":\"%s\"}],\"actions\":[\"Admin\",\"Read\",\"List\",\"Tagging\",\"Write\"]}]}' \"$S3_CHAVE\" \"$S3_SEGREDO\" > /tmp/s3.json && { flock -n /data/.instancia true || { echo 'RECUSADO: outra instância do storage está usando /data (Easypanel > Implantações: desligue o Zero Downtime).' >&2; exit 1; }; } && exec flock -n /data/.instancia weed server -dir=/data -ip=127.0.0.1 -ip.bind=0.0.0.0 -volume.max=0 -master.volumeSizeLimitMB=1024 -s3 -s3.port=8333 -s3.config=/tmp/s3.json"]
