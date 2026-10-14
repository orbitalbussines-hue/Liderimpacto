import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { VerificacaoPublica } from "@/lib/certificados/consultas";
import { VerificacaoPublicaCertificado } from "./verificacao-publica";

const valido: VerificacaoPublica = {
  situacao: "VALIDO",
  codigo: "L72YFQWS5Y",
  codigoLegivel: "L72YF-QWS5Y",
  nome: "Ana Souza",
  curso: "Líder de Impacto",
  cargaHoraria: "9 horas",
  concluidoEm: new Date("2026-09-21T15:00:00Z"),
  emitidoEm: new Date("2026-09-21T15:01:00Z"),
  revogadoEm: null,
  criador: "Líder de Impacto",
  temPdf: true,
};

describe("VerificacaoPublicaCertificado", () => {
  it("válido: dados do certificado e Baixar PDF", () => {
    render(<VerificacaoPublicaCertificado certificado={valido} codigoPedido="L72YFQWS5Y" hrefPdf="/certificado/L72YFQWS5Y/pdf" />);
    expect(screen.getByRole("heading", { level: 1, name: "Certificado válido" })).toBeInTheDocument();
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("9 horas")).toBeInTheDocument();
    expect(screen.getByText("L72YF-QWS5Y")).toBeInTheDocument();
    expect(screen.getAllByText("21 de setembro de 2026")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Baixar PDF" })).toHaveAttribute("href", "/certificado/L72YFQWS5Y/pdf");
  });

  it("válido sem PDF pronto: avisa e não oferece o download", () => {
    render(<VerificacaoPublicaCertificado certificado={{ ...valido, temPdf: false }} codigoPedido="x" hrefPdf="/x" />);
    expect(screen.queryByRole("link", { name: "Baixar PDF" })).not.toBeInTheDocument();
    expect(screen.getByText(/sendo preparado/)).toBeInTheDocument();
  });

  it("revogado: diz revogado, com a data, e não deixa baixar", () => {
    render(
      <VerificacaoPublicaCertificado
        certificado={{ ...valido, situacao: "REVOGADO", revogadoEm: new Date("2026-10-01T15:00:00Z"), temPdf: false }}
        codigoPedido="L72YFQWS5Y"
        hrefPdf="/x"
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Certificado revogado" })).toBeInTheDocument();
    expect(screen.getByText(/foi revogado em 1 de outubro de 2026/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Baixar PDF" })).not.toBeInTheDocument();
  });

  it("inexistente: não encontrado, com o código pedido", () => {
    render(<VerificacaoPublicaCertificado certificado={null} codigoPedido="ZZZZZ99999" hrefPdf="/x" />);
    expect(screen.getByRole("heading", { level: 1, name: "Certificado não encontrado" })).toBeInTheDocument();
    expect(screen.getByText("ZZZZZ99999")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
