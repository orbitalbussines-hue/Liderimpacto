import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EstiloMarca } from "./estilo-marca";

const css = (ui: React.ReactElement) => render(ui).container.querySelector("style")?.innerHTML ?? null;

describe("EstiloMarca", () => {
  it("cor do criador vale para a area do aluno; dourado padrao nao gera CSS", () => {
    expect(css(<EstiloMarca cor="#8E1F3A" />)).toContain('[data-area="aluno"]');
    expect(css(<EstiloMarca cor="#D9A441" />)).toBeNull();
  });

  it("cor do curso fica restrita ao escopo e gera CSS mesmo no dourado padrao", () => {
    const saida = css(<EstiloMarca cor="#D9A441" escopo="curso-123" />);
    expect(saida).toContain('[data-marca="curso-123"]');
    expect(saida).not.toContain("data-area");
  });

  it("recusa escopo fora do formato (nada de injecao no seletor)", () => {
    expect(css(<EstiloMarca cor="#1A237E" escopo={'x"]{}body{color:red}'} />)).toBeNull();
    expect(css(<EstiloMarca cor="nao-e-cor" escopo="curso-1" />)).toBeNull();
  });
});
