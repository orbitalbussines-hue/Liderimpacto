import { afterEach, describe, expect, it, vi } from "vitest";
import { salvarTagsDoMembro } from "./acoes-membro";

const tags = vi.hoisted(() => ({ acaoAplicarTag: vi.fn(), acaoRemoverTag: vi.fn() }));
vi.mock("@/lib/actions/tags", () => tags);
vi.mock("@/lib/actions/membros-gestao", () => ({}));
vi.mock("@/lib/actions/usuarios-senha", () => ({}));
vi.mock("@/lib/actions/matriculas", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("salvarTagsDoMembro", () => {
  afterEach(() => vi.resetAllMocks());

  it("aplica só as novas, remove só as desmarcadas e para no primeiro erro", async () => {
    tags.acaoAplicarTag.mockResolvedValue({ ok: true, dados: { aplicadas: 1, jaTinham: 0 } });
    tags.acaoRemoverTag.mockResolvedValue({ ok: false, erro: "Tag não encontrada." });
    const r = await salvarTagsDoMembro("m1", ["a", "b"], ["b", "c"]);
    expect(tags.acaoAplicarTag).toHaveBeenCalledExactlyOnceWith({ tagId: "c", membroIds: ["m1"] });
    expect(tags.acaoRemoverTag).toHaveBeenCalledExactlyOnceWith({ tagId: "a", membroIds: ["m1"] });
    expect(r).toEqual({ ok: false, erro: "Tag não encontrada." });
  });

  it("sem mudança não chama nada", async () => {
    expect(await salvarTagsDoMembro("m1", ["a"], ["a"])).toEqual({ ok: true, dados: null });
    expect(tags.acaoAplicarTag).not.toHaveBeenCalled();
  });
});
