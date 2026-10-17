/**
 * Versão do schema (ADR-0016): o `/api/saude` e os workers só seguem com o banco tendo TODAS as
 * migrações que o código conhece. No banco de teste (migrado pelo CI) está em dia; uma versão do
 * código mais nova que o banco, ou banco sem a tabela de controle, não está.
 */
import { describe, expect, it } from "vitest";
import { esquemaAtende, esquemaEmDia, ULTIMA_MIGRACAO } from "@/lib/db/migracoes";

describe("versão do schema", () => {
  it("banco de teste migrado está em dia", async () => {
    expect(await esquemaEmDia()).toBe(true);
  });

  it("schema mais novo que o código (versão anterior no ar durante o deploy) atende", () => {
    expect(esquemaAtende(ULTIMA_MIGRACAO)).toBe(true);
    expect(esquemaAtende(ULTIMA_MIGRACAO + 1)).toBe(true);
  });

  it("migração pendente ou tabela de controle vazia não atende", () => {
    expect(esquemaAtende(ULTIMA_MIGRACAO - 1)).toBe(false);
    expect(esquemaAtende(null)).toBe(false);
  });
});
