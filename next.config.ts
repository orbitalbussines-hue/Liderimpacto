import type { NextConfig } from "next";

type PadraoRemoto = NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]>[number];

/**
 * Imagens (capas, thumbs) vem do storage S3 por URL pre-assinada (src/lib/armazenamento/cliente.ts,
 * `urlDeImagem`). O otimizador so aceita o host do storage configurado por env e so o caminho das
 * chaves de criador (`criadores/**`) do bucket de arquivos; a query (assinatura) varia, entao fica
 * livre. Sem S3_* no ambiente, nenhum host remoto e liberado.
 * `dangerouslyAllowLocalIP` so quando o storage e local (SeaweedFS do docker-compose em dev): o
 * Next 16 recusa otimizar imagem de IP privado por padrao (SSRF). Em producao (R2) fica desligado.
 */
function imagensDoStorage(): { remotePatterns: PadraoRemoto[]; dangerouslyAllowLocalIP: boolean } {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET_ARQUIVOS;
  if (!endpoint || !bucket) return { remotePatterns: [], dangerouslyAllowLocalIP: false };
  const u = new URL(endpoint);
  const caminho = process.env.S3_FORCAR_CAMINHO !== "false";
  return {
    remotePatterns: [
      {
        protocol: u.protocol === "http:" ? "http" : "https",
        hostname: caminho ? u.hostname : `${bucket}.${u.hostname}`,
        port: u.port,
        pathname: caminho ? `/${bucket}/criadores/**` : "/criadores/**",
      },
    ],
    dangerouslyAllowLocalIP: ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname),
  };
}

const nextConfig: NextConfig = {
  // Imagem Docker enxuta (deploy/docker/app.Dockerfile): `.next/standalone/server.js`, sem o
  // node_modules inteiro. Nao muda o `next dev`. O config e serializado no BUILD: o `images` acima
  // usa o S3_ENDPOINT publico passado como build-arg pelo CI (ADR-0015/0016; se um dia o Easypanel
  // construir a partir do GitHub, as variaveis do servico chegam como build-arg, doc "Builders").
  output: "standalone",
  // APRESENTACAO=1 esconde o indicador "N" do next dev (demo ao cliente); erros continuam aparecendo.
  ...(process.env.APRESENTACAO === "1" ? { devIndicators: false as const } : {}),
  cacheComponents: true,
  partialPrefetching: true,
  // forbidden() nas guardas de pagina (403 com a recusa na trilha): src/lib/auth/guarda.ts.
  experimental: { authInterrupts: true },
  images: imagensDoStorage(),
  // Cabecalhos de seguranca no PROPRIO app (antes eram so do Caddy, ADR-0015): no Easypanel a borda
  // e o Traefik dele, sem esses cabecalhos (ADR-0016). Com o Caddy na frente, ele sobrescreve com os
  // mesmos valores. HSTS so no build de producao (no `next dev` em http seria ignorado mesmo).
  // X-Frame-Options SAMEORIGIN: a previa do construtor e iframe da mesma origem (ADR-0010).
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:caminho*",
        headers: [
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
            : []),
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
