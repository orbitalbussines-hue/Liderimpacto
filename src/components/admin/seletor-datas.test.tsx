import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SeletorDatas } from "./seletor-datas";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

const HOJE = "2026-10-14";
const abrir = () => fireEvent.click(screen.getByRole("button", { name: /^Período:/ }));
const dia = (rotulo: string) => screen.getByRole("button", { name: new RegExp(`^${rotulo}`) });

beforeEach(() => nav.push.mockClear());

describe("SeletorDatas", () => {
  it("gatilho mostra o intervalo; abre com dois meses, atalhos e o ativo destacado", async () => {
    render(<SeletorDatas valor={{ de: "2026-09-15", ate: HOJE }} hoje={HOJE} caminho="/admin" />);
    expect(screen.getByRole("button", { name: "Período: 15/09/2026 a 14/10/2026" })).toBeInTheDocument();
    abrir();
    const painel = await screen.findByRole("dialog", { name: "Escolher período" });
    expect(within(painel).getByRole("group", { name: "Setembro 2026" })).toBeInTheDocument();
    expect(within(painel).getByRole("group", { name: "Outubro 2026" })).toBeInTheDocument();
    expect(within(painel).getByRole("button", { name: "Últimos 30 dias" })).toHaveAttribute("aria-pressed", "true");
    expect(dia("15 de outubro de 2026")).toBeDisabled(); // depois de hoje
    expect(dia("14 de outubro de 2026")).toHaveAttribute("aria-current", "date");
    expect(screen.getByRole("button", { name: "Próximo mês" })).toBeDisabled();
  });

  it("atalho só marca o intervalo; Cancelar fecha sem navegar", async () => {
    render(<SeletorDatas valor={{ de: "2026-09-15", ate: HOJE }} hoje={HOJE} caminho="/admin" />);
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Mês passado" }));
    expect(screen.getByRole("button", { name: "Mês passado" })).toHaveAttribute("aria-pressed", "true");
    expect(dia("1 de setembro de 2026, início do período")).toHaveAttribute("aria-pressed", "true");
    expect(dia("30 de setembro de 2026, fim do período")).toBeInTheDocument();
    expect(screen.getByText("01/09/2026 a 30/09/2026")).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(nav.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Período: 15/09/2026 a 14/10/2026" })).toBeInTheDocument();
  });

  it("dois cliques formam o intervalo (ordem trocada vira de ≤ ate); Atualizar navega com de/ate e mantém os filtros", async () => {
    const curso = "0b9d7a3e-2f4c-4f7a-9b1e-3c2d1e0f9a8b";
    render(<SeletorDatas valor={null} hoje={HOJE} caminho="/admin/analytics" manter={{ aba: "avaliacoes", curso, ordem: null }} />);
    expect(screen.getByRole("button", { name: "Período: Todo o período" })).toBeInTheDocument();
    abrir();
    const atualizar = await screen.findByRole("button", { name: "Atualizar" });
    expect(atualizar).toBeDisabled();
    fireEvent.click(dia("10 de outubro de 2026"));
    expect(screen.getByText("10/10/2026 a …")).toBeInTheDocument();
    expect(atualizar).toBeDisabled();
    fireEvent.mouseEnter(dia("3 de outubro de 2026"));
    expect(dia("5 de outubro de 2026")).toHaveAttribute("aria-pressed", "true"); // prévia
    fireEvent.click(dia("3 de outubro de 2026"));
    expect(screen.getByText("03/10/2026 a 10/10/2026")).toBeInTheDocument();
    fireEvent.click(atualizar);
    expect(nav.push).toHaveBeenCalledWith(`/admin/analytics?aba=avaliacoes&curso=${curso}&de=2026-10-03&ate=2026-10-10`, { scroll: false });
  });

  it("navega entre meses e bloqueia o fim a 366 dias ou mais do início", async () => {
    render(<SeletorDatas valor={null} hoje={HOJE} caminho="/admin" />);
    abrir();
    const voltar = async (n: number) => {
      for (let i = 0; i < n; i++) fireEvent.click((await screen.findAllByRole("button", { name: "Mês anterior" }))[0]);
    };
    await voltar(12);
    expect(screen.getByRole("group", { name: "Outubro 2025" })).toBeInTheDocument();
    fireEvent.click(dia("15 de outubro de 2025"));
    await voltar(12);
    expect(dia("15 de outubro de 2024")).toBeEnabled(); // 365 dias antes: cabe
    expect(dia("14 de outubro de 2024")).toBeDisabled(); // 366 dias antes: o intervalo teria 367
  });
});
