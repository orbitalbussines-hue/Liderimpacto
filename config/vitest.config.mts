import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// O .env local (nunca versionado) pode trazer DATABASE_URL_TESTE; no CI ela vem do ambiente.
try {
  process.loadEnvFile();
} catch {
  // sem .env: segue com o ambiente atual
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../src", import.meta.url)),
      // `server-only` existe para o BUNDLER recusar o modulo no cliente; fora do Next ele so
      // lanca. O teste de integracao roda em node e importa esses modulos (auth, sessao).
      "server-only": fileURLToPath(new URL("../node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unidade",
          environment: "jsdom",
          setupFiles: ["config/vitest.setup.ts"],
          // .mjs de tests/ sao scripts Node (ex.: check-compliance.test.mjs), nao Vitest.
          include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
          exclude: ["tests/integracao/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "integracao",
          // PostgreSQL REAL (lider_impacto_teste), nunca SQLite nem o banco de dev.
          environment: "node",
          setupFiles: ["tests/integracao/_ambiente.ts"],
          include: ["tests/integracao/**/*.test.ts"],
          // Um arquivo por vez: arquivos paralelos no mesmo banco ja deram corrida no Espaco 7.
          fileParallelism: false,
          // Carregar o Better Auth inteiro + scrypt de 128 MiB por senha: os 5 s padrao nao bastam.
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
