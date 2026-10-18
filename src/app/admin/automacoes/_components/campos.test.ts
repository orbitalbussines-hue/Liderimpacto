import { describe, expect, it } from "vitest";
import { MOTIVOS_ENVIO } from "@/lib/marketing/regras";
import { CAMPOS_VAZIOS, camposDaAutomacao, entradaDaAutomacao } from "./campos";
import { atrasoEmUnidade, descreverAtraso, descreverGatilho, descreverReferencia, resultadoDaExecucao } from "./comum";

const CURSO = "0b8f0d7e-6f5e-4c1a-9a51-0d6f7b6c3a10";
const TAG = "1c9f1e8f-7a6f-4d2b-8b62-1e7a8c7d4b21";
const EMAIL = { assunto: "Parabéns!", previa: "", titulo: "Você concluiu", corpo: "Veja https://exemplo.com.", botaoTexto: "", botaoUrl: "" };

describe("formulário da automação (tela ⇄ action)", () => {
  it("converte a espera para minutos, limpa curso/dias que o gatilho não pede e o schema da action aceita", () => {
    const r = entradaDaAutomacao({ ...CAMPOS_VAZIOS, nome: "Parabéns", gatilho: "CURSO_CONCLUIDO", produtoId: CURSO, dias: "9", atrasoValor: "2", atrasoUnidade: "dias", ...EMAIL });
    expect(r).toMatchObject({ ok: true, entrada: { produtoId: CURSO, dias: null, atrasoMinutos: 2880, tagId: null, conteudo: { assunto: "Parabéns!", botao: null } } });
  });

  it("recusa espera acima de 30 dias, gatilho de dias sem dias e nenhuma ação", () => {
    const r = entradaDaAutomacao({ ...CAMPOS_VAZIOS, nome: "Volte", gatilho: "INATIVIDADE", atrasoValor: "31", atrasoUnidade: "dias", comEmail: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros).toMatchObject({ atraso: "A espera pode ser de no máximo 30 dias.", dias: "Informe em quantos dias.", acao: expect.any(String) });
  });

  it("só tag, sem escolher a tag: pede a tag (não a ação); erro do conteúdo cai no campo certo", () => {
    const r = entradaDaAutomacao({ ...CAMPOS_VAZIOS, nome: "Tag", comEmail: false, comTag: true });
    expect(r).toEqual({ ok: false, erros: { tagId: "Escolha a tag." } });
    const b = entradaDaAutomacao({ ...CAMPOS_VAZIOS, nome: "Botão", ...EMAIL, botaoTexto: "Abrir", botaoUrl: "http://x.com" });
    if (!b.ok) expect(Object.keys(b.erros)).toEqual(["botaoUrl"]);
    expect(b.ok).toBe(false);
  });

  it("editar: minutos gravados voltam na maior unidade exata", () => {
    const c = camposDaAutomacao({ nome: "X", gatilho: "NUNCA_ACESSOU", produtoId: null, dias: 7, atrasoMinutos: 180, conteudo: null, tagId: TAG });
    expect(c).toMatchObject({ dias: "7", atrasoValor: "3", atrasoUnidade: "horas", comEmail: false, comTag: true, tagId: TAG });
    expect(atrasoEmUnidade(90)).toEqual({ valor: 90, unidade: "minutos" });
  });
});

describe("textos simples", () => {
  it("gatilho, espera e referência em português", () => {
    expect(descreverGatilho("CURSO_CONCLUIDO", "Liderança", null)).toBe("Quando alguém conclui o curso Liderança");
    expect(descreverGatilho("INATIVIDADE", null, 14)).toBe("Quando alguém fica 14 dias sem entrar");
    expect(descreverAtraso(0)).toBe("Na hora");
    expect(descreverAtraso(1440)).toBe("1 dia depois");
    expect(descreverReferencia("inativo:2026-10-01T12:00:00.000Z", () => "01/10/26")).toBe("Sem entrar desde 01/10/26");
    expect(descreverReferencia(`curso:${CURSO}`, String)).toBe("Curso concluído");
  });

  it("resultado: descadastrado aparece como tal; só tag = tag aplicada", () => {
    const base = { situacao: "CONCLUIDA" as const, motivo: null, tagAplicada: false };
    expect(resultadoDaExecucao({ ...base, envioSituacao: "IGNORADO", envioMotivo: MOTIVOS_ENVIO.DESCADASTRADO }).texto).toBe("Descadastrado");
    expect(resultadoDaExecucao({ ...base, tagAplicada: true, envioSituacao: null, envioMotivo: null }).texto).toBe("Tag aplicada");
    expect(resultadoDaExecucao({ ...base, situacao: "AGENDADA", envioSituacao: null, envioMotivo: null }).texto).toBe("Agendado");
  });
});
