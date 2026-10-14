import { defineConfig } from "drizzle-kit";

// drizzle-kit nao le o .env sozinho. No CI a variavel ja vem do ambiente.
try {
  process.loadEnvFile();
} catch {
  // sem .env: segue com o ambiente atual
}

export default defineConfig({
  schema: "./src/lib/db/schema/index.ts",
  out: "./src/lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
