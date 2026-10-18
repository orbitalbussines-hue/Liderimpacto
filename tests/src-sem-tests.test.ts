import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** A imagem Docker não leva `tests/` (.dockerignore) e o build checa os tipos de todo `src/`. */
const arquivos = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? arquivos(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));

describe("src não importa de tests/", () => {
  it("nenhum arquivo de src/ aponta para a pasta tests/", () => {
    const culpados = arquivos("src").filter((f) => /from\s+["'][^"']*\/tests\//.test(readFileSync(f, "utf8")));
    expect(culpados).toEqual([]);
  });
});
