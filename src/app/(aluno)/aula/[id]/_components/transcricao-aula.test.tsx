import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AulaInterativa, type AulaInterativaProps } from "./aula-interativa";
import { TranscricaoAula } from "./transcricao-aula";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/actions/progresso", () => ({ acaoConcluirAula: vi.fn(), acaoRegistrarProgresso: vi.fn() }));
vi.mock("@/lib/actions/anotacoes", () => ({ acaoCriarAnotacao: vi.fn(), acaoEditarAnotacao: vi.fn(), acaoRemoverAnotacao: vi.fn() }));
vi.mock("@/lib/actions/aulas", () => ({ acaoLinkDoMaterial: vi.fn() }));
vi.mock("@/lib/actions/videos", () => ({ acaoIniciarReproducao: vi.fn(), acaoRenovarReproducao: vi.fn() }));

const VTT = "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nOlá, turma!\n\n00:00:05.000 --> 00:00:09.000\nA ação do líder &lt;define&gt; a cultura.\n\n00:01:10.000 --> 00:01:12.000\nAté a próxima.\n";

describe("TranscricaoAula", () => {
  const fetchFalso = vi.fn();
  beforeEach(() => {
    fetchFalso.mockReset().mockResolvedValue(new Response(VTT, { status: 200 }));
    vi.stubGlobal("fetch", fetchFalso);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("só baixa ao abrir; mostra os trechos com tempo; clicar leva ao ponto; o atual fica destacado", async () => {
    const onIrPara = vi.fn();
    const { rerender } = render(<TranscricaoAula url="/api/legendas/l1" ativa={false} tempo={0} onIrPara={onIrPara} />);
    expect(fetchFalso).not.toHaveBeenCalled();
    rerender(<TranscricaoAula url="/api/legendas/l1" ativa tempo={6} onIrPara={onIrPara} />);
    const lista = await screen.findByRole("list", { name: "Trechos da transcrição" });
    expect(fetchFalso).toHaveBeenCalledWith("/api/legendas/l1", { credentials: "same-origin" });
    const itens = within(lista).getAllByRole("listitem");
    expect(itens.map((i) => i.textContent)).toEqual(["00:01Olá, turma!", "00:05A ação do líder <define> a cultura.", "01:10Até a próxima."]);
    expect(itens[1]).toHaveAttribute("aria-current", "true");
    expect(itens[0]).not.toHaveAttribute("aria-current");
    fireEvent.click(within(itens[2]).getByRole("button"));
    expect(onIrPara).toHaveBeenCalledWith(70);
    rerender(<TranscricaoAula url="/api/legendas/l1" ativa tempo={71} onIrPara={onIrPara} />);
    expect(within(lista).getAllByRole("listitem")[2]).toHaveAttribute("aria-current", "true");
  });

  it("busca sem acento filtra e marca o termo; nada encontrado avisa", async () => {
    render(<TranscricaoAula url="/x" ativa tempo={0} onIrPara={vi.fn()} />);
    const busca = await screen.findByRole("searchbox", { name: "Buscar na transcrição" });
    fireEvent.change(busca, { target: { value: "ACAO" } });
    const itens = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(itens).toHaveLength(1);
    expect(itens[0].querySelector("mark")).toHaveTextContent("ação");
    expect(screen.getByRole("status")).toHaveTextContent("1 trecho encontrado");
    fireEvent.change(busca, { target: { value: "zzz" } });
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Nada encontrado");
  });

  it("falha ao baixar: erro com tentar de novo", async () => {
    fetchFalso.mockResolvedValueOnce(new Response(null, { status: 403 }));
    render(<TranscricaoAula url="/x" ativa tempo={0} onIrPara={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Tentar novamente/ }));
    expect(await screen.findByRole("list")).toBeInTheDocument();
  });
});

describe("aba Transcrição na página da aula", () => {
  const base: AulaInterativaProps = {
    aula: { id: "a1", numero: "1.1", titulo: "Aula", descricao: null, duracaoSeg: 60, capitulos: [] },
    eyebrow: "Módulo 1 · Aula 1",
    player: { poster: null, marcaDagua: "Ana", retomarEm: 0, autoIniciar: false },
    flags: { abas: { descricao: true, materiais: true, comentarios: false, anotacoes: false }, autoplay: false, contagemAutoplaySeg: 5, velocidade: true, marcadores: true },
    concluida: false,
    concluirManual: false,
    podeAnotar: false,
    anterior: null,
    proxima: null,
    materiais: [],
    anotacoes: [],
  };
  const legendas = [{ id: "l1", idioma: "pt-BR", rotulo: "Português", url: "/api/legendas/l1" }];

  it("aparece depois de Descrição só quando há legenda e player", () => {
    const { rerender } = render(<AulaInterativa {...base} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Descrição", "Materiais"]);
    rerender(<AulaInterativa {...base} legendas={legendas} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Descrição", "Transcrição", "Materiais"]);
    rerender(<AulaInterativa {...base} player={null} quadro={<div />} legendas={legendas} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Descrição", "Materiais"]);
  });
});
