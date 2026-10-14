import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODELO_PADRAO, preencherTexto } from "@/lib/certificados/regras";
import { partesDoTexto, PreviaCertificado } from "./previa-certificado";

const variaveis = { nome: "Ana Souza", curso: "Líder de Impacto", carga_horaria: "9 horas", data: "14 de outubro de 2026" };

describe("partesDoTexto (mesma divisão do PDF)", () => {
  it("separa o que vem antes do nome (itálico) do resto (corpo), sem a vírgula inicial", () => {
    const texto = preencherTexto(MODELO_PADRAO.texto, variaveis);
    expect(partesDoTexto(texto, "Ana Souza")).toEqual({
      antes: "Certificamos que",
      depois: "concluiu o curso Líder de Impacto, com carga horária de 9 horas, em 14 de outubro de 2026.",
    });
    expect(partesDoTexto("Ana Souza, parabéns pela conclusão.", "Ana Souza")).toEqual({ antes: "", depois: "parabéns pela conclusão." });
  });
  it("sem o nome no texto: tudo vai para o corpo", () => {
    expect(partesDoTexto("Texto sem nome.", "Ana")).toEqual({ antes: "", depois: "Texto sem nome." });
  });
});

describe("PreviaCertificado", () => {
  it("mostra o modelo com as variáveis substituídas, assinatura, código e data", () => {
    render(
      <PreviaCertificado
        dados={{
          criador: "Líder de Impacto",
          titulo: "Certificado de conclusão",
          texto: preencherTexto("Certificamos que {nome} concluiu {curso} ({carga_horaria}) em {data}.", variaveis),
          nome: variaveis.nome,
          assinaturaNome: "Valmer Albuquerque",
          assinaturaCargo: "Mentor",
          cor: "#b48224",
          codigoLegivel: "K7M2X-9QP4H",
          urlVerificacao: "https://demo.localhost/certificado/K7M2X9QP4H",
          concluidoEm: variaveis.data,
        }}
      />,
    );
    const img = screen.getByRole("img", { name: /Prévia do certificado/ });
    expect(img).toHaveAccessibleName(expect.stringContaining("Ana Souza concluiu Líder de Impacto (9 horas) em 14 de outubro de 2026."));
    expect(img).toHaveTextContent("Certificamos que");
    expect(img).toHaveTextContent("concluiu Líder de Impacto (9 horas) em 14 de outubro de 2026.");
    expect(img).not.toHaveTextContent("{");
    expect(img).toHaveTextContent("Valmer Albuquerque");
    expect(img).toHaveTextContent("Código K7M2X-9QP4H");
    expect(img).toHaveTextContent("demo.localhost/certificado/K7M2X9QP4H");
    expect(img).toHaveTextContent("Concluído em 14 de outubro de 2026");
  });
});
