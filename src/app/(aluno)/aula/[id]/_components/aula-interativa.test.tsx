import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AulaInterativa, type AulaInterativaProps } from "./aula-interativa";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const concluir = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/lib/actions/progresso", () => ({ acaoConcluirAula: concluir, acaoRegistrarProgresso: vi.fn() }));
vi.mock("@/lib/actions/anotacoes", () => ({ acaoCriarAnotacao: vi.fn(), acaoEditarAnotacao: vi.fn(), acaoRemoverAnotacao: vi.fn() }));
vi.mock("@/lib/actions/aulas", () => ({ acaoLinkDoMaterial: vi.fn() }));
vi.mock("@/lib/actions/videos", () => ({ acaoIniciarReproducao: vi.fn(), acaoRenovarReproducao: vi.fn() }));

const base: AulaInterativaProps = {
  aula: {
    id: "a1",
    numero: "3.2",
    titulo: "Cultura organizacional do líder",
    descricao: "Como a cultura nasce do que o líder tolera.",
    duracaoSeg: 600,
    capitulos: [
      { inicioSeg: 0, titulo: "Introdução" },
      { inicioSeg: 120, titulo: "Os 3 sinais" },
    ],
  },
  eyebrow: "Módulo 3 · Aula 2",
  player: null,
  quadro: <div>QUADRO</div>,
  flags: { abas: { descricao: true, materiais: true, comentarios: false, anotacoes: true }, autoplay: true, contagemAutoplaySeg: 5, velocidade: true, marcadores: true },
  concluida: false,
  concluirManual: true,
  podeAnotar: true,
  anterior: { id: "a0", numero: "3.1", titulo: "Anterior", href: "/aula/a0" },
  proxima: { id: "a3", numero: "3.3", titulo: "Próxima", href: "/aula/a3" },
  materiais: [{ id: "m1", nome: "Material complementar", tipo: "LINK", url: "https://exemplo.com", tamanhoBytes: null }],
  anotacoes: [],
};

describe("AulaInterativa (estados da página)", () => {
  beforeEach(() => {
    nav.push.mockReset();
    nav.refresh.mockReset();
    concluir.mockReset();
  });

  it("sem player mostra o quadro de aviso, cabeçalho, capítulos e abas conforme as flags", () => {
    render(<AulaInterativa {...base} />);
    expect(screen.getByText("QUADRO")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: base.aula.titulo })).toBeInTheDocument();
    expect(screen.getByText("Módulo 3 · Aula 2")).toBeInTheDocument();
    expect(screen.getByText("Os 3 sinais")).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Descrição", "Materiais (1)", "Comentários", "Anotações"]);
    expect(screen.getByRole("link", { name: /Material complementar/ })).toHaveAttribute("target", "_blank");
  });

  it("flags e permissão escondem abas", () => {
    render(<AulaInterativa {...base} podeAnotar={false} flags={{ ...base.flags, abas: { ...base.flags.abas, materiais: false } }} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Descrição", "Comentários"]);
  });

  it("Concluir e avançar chama a action e vai para a próxima", async () => {
    concluir.mockResolvedValue({ ok: true, dados: { concluida: true } });
    render(<AulaInterativa {...base} />);
    fireEvent.click(screen.getByRole("button", { name: /Concluir e avançar/ }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/aula/a3"));
    expect(concluir).toHaveBeenCalledWith({ aulaId: "a1" });
  });

  it("recusa da action aparece e não navega", async () => {
    concluir.mockResolvedValue({ ok: false, erro: "Sem permissão." });
    render(<AulaInterativa {...base} />);
    fireEvent.click(screen.getByRole("button", { name: /Concluir e avançar/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem permissão.");
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("já concluída: selo e botão vira Próxima aula (sem chamar a action)", async () => {
    render(<AulaInterativa {...base} concluida />);
    expect(screen.getByText("Concluída")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Próxima aula/ }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/aula/a3"));
    expect(concluir).not.toHaveBeenCalled();
  });

  it("sem conclusão manual e não concluída: só o link da próxima", () => {
    render(<AulaInterativa {...base} concluirManual={false} />);
    expect(screen.queryByRole("button", { name: /Concluir/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Próxima aula/ })).toHaveAttribute("href", "/aula/a3");
  });
});
