import { describe, expect, it } from "vitest";
import { ctaDaTrilha, estadosDaTrilha, indiceDoProximoPasso, textoEtapas, type DadosItemTrilha } from "./regras";

const item = (o: Partial<DadosItemTrilha> = {}): DadosItemTrilha => ({ tipo: "PRODUTO", exigeAnterior: true, concluido: false, iniciado: false, motivoProprio: null, ...o });

describe("trilhas (RN-126)", () => {
  it("exige o anterior trava; sem exigir, abre; concluído vale mesmo fora de ordem", () => {
    const e = estadosDaTrilha([item({ concluido: true }), item({ iniciado: true }), item(), item({ exigeAnterior: false }), item({ concluido: true })]);
    expect(e.map((x) => x.estado)).toEqual(["concluido", "andamento", "bloqueado", "disponivel", "concluido"]);
    expect(e[2].motivo).toBe("ANTERIOR");
  });
  it("motivo próprio (sem matrícula, avaliação) depois do anterior", () => {
    const e = estadosDaTrilha([item({ concluido: true }), item({ motivoProprio: "MATRICULA" }), item({ tipo: "AVALIACAO", exigeAnterior: false, motivoProprio: "AULAS_PENDENTES" })]);
    expect(e.map((x) => x.motivo)).toEqual([null, "MATRICULA", "AULAS_PENDENTES"]);
  });
  it("CTA e próximo passo", () => {
    const tudo = estadosDaTrilha([item({ concluido: true }), item({ concluido: true })]);
    expect(ctaDaTrilha(tudo)).toBe("Rever");
    expect(indiceDoProximoPasso(tudo)).toBe(-1);
    const nada = estadosDaTrilha([item(), item()]);
    expect(ctaDaTrilha(nada)).toBe("Iniciar");
    expect(indiceDoProximoPasso(nada)).toBe(0);
    const meio = estadosDaTrilha([item({ concluido: true }), item({ motivoProprio: "MATRICULA" }), item({ exigeAnterior: false })]);
    expect(ctaDaTrilha(meio)).toBe("Continuar");
    expect(indiceDoProximoPasso(meio)).toBe(2);
    expect(indiceDoProximoPasso(estadosDaTrilha([item({ motivoProprio: "MATRICULA" })]))).toBe(0);
    expect(textoEtapas(3, 5)).toBe("3 de 5 etapas");
  });
});
