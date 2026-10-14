import Link from "next/link";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BotaoBaixarCertificado } from "@/components/certificados/botao-baixar-certificado";
import { CartaoCertificado } from "./cartao-certificado";

vi.mock("@/lib/actions/certificados", () => ({ acaoBaixarCertificado: vi.fn() }));

const base = { titulo: "Líder de Impacto", nomeAluno: "Ana Souza", meta: "Emitido em 21/09/2026 · 9 horas" };

describe("CartaoCertificado", () => {
  it("emitido: prévia com o nome e o curso, Baixar PDF habilitado", () => {
    render(<CartaoCertificado {...base} bloqueado={false} acao={<BotaoBaixarCertificado certificadoId="c1" pdf="PRONTA" />} />);
    expect(screen.getByText("Certificamos que")).toBeInTheDocument();
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("concluiu Líder de Impacto")).toBeInTheDocument();
    expect(screen.queryByText("Conclua o curso para emitir")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Baixar PDF" })).toBeEnabled();
  });

  it("gerando: botão Gerando… desabilitado", () => {
    render(<CartaoCertificado {...base} bloqueado={false} acao={<BotaoBaixarCertificado certificadoId="c1" pdf="PENDENTE" />} />);
    expect(screen.getByRole("button", { name: "Gerando…" })).toBeDisabled();
  });

  it("revogado: véu e botão desabilitado", () => {
    render(<CartaoCertificado {...base} bloqueado={false} sobreposicao="Certificado revogado" acao={<BotaoBaixarCertificado certificadoId="c1" pdf="PRONTA" revogado />} />);
    expect(screen.getByText("Certificado revogado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revogado" })).toBeDisabled();
  });

  it("bloqueado: véu, progresso e o que falta, com link para continuar o curso", () => {
    render(
      <CartaoCertificado
        {...base}
        meta="Faltam 5 aulas e 1 avaliação"
        bloqueado
        progresso={42}
        hrefCurso="/cursos/lider"
        detalhe={<Link href="/avaliacoes/a1">Avaliação final</Link>}
      />,
    );
    expect(screen.getByText("Conclua o curso para emitir")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Progresso em Líder de Impacto" })).toHaveAttribute("aria-valuenow", "42");
    expect(screen.getByText("Faltam 5 aulas e 1 avaliação")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Avaliação final" })).toHaveAttribute("href", "/avaliacoes/a1");
    expect(screen.getByRole("link", { name: "Continuar curso" })).toHaveAttribute("href", "/cursos/lider");
  });
});
