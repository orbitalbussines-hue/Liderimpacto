# syntax=docker/dockerfile:1
# Serviço `storage` (SeaweedFS, API S3) do Easypanel (ADR-0016) — COLE este conteúdo em
# App > Source > Dockerfile. Mesma versão do dev e do compose da HML. Só a API S3 (8333) é publicada,
# pelo domínio s3.lideresdeimpacto.com.br do Traefik. A credencial vem das variáveis S3_CHAVE/S3_SEGREDO do serviço
# e vira o s3.json em /tmp na subida (nada em camada). Volume do Easypanel montado em /data.
FROM chrislusf/seaweedfs:4.48
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD ["sh", "-c", "wget -q -O /dev/null http://127.0.0.1:8333/healthz"]
ENTRYPOINT ["/bin/sh", "-c"]
CMD ["umask 077 && test -n \"$S3_CHAVE\" && test -n \"$S3_SEGREDO\" && printf '{\"identities\":[{\"name\":\"lider-app\",\"credentials\":[{\"accessKey\":\"%s\",\"secretKey\":\"%s\"}],\"actions\":[\"Admin\",\"Read\",\"List\",\"Tagging\",\"Write\"]}]}' \"$S3_CHAVE\" \"$S3_SEGREDO\" > /tmp/s3.json && exec weed server -dir=/data -volume.max=0 -master.volumeSizeLimitMB=1024 -s3 -s3.port=8333 -s3.config=/tmp/s3.json"]
