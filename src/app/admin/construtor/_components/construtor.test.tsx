import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { configPadrao, FILEIRAS_PADRAO, fileiraDeModulos, type FileiraVitrine } from "@/lib/vitrine/config";
import { EstruturaVitrine } from "./estrutura-vitrine";
import { ModeloModulos } from "./modelo-modulos";
import { PropriedadesFileira, type CursoDoConstrutor } from "./propriedades-fileira";
import { StatusVitrine, situacaoDoRascunho } from "./status-vitrine";
import { ESPERA_AUTOSAVE_MS, useRascunho } from "./use-rascunho";

vi.mock("@/lib/actions/vitrine", () => ({ acaoBuscarConteudoVitrine: vi.fn(), acaoPrepararImagemDestaque: vi.fn() }));
vi.mock("@/lib/actions/arquivos", () => ({ acaoIniciarEnvio: vi.fn(), acaoConfirmarEnvio: vi.fn() }));

const fileiras = FILEIRAS_PADRAO.slice(0, 3).map((f) => ({ ...f }));

function estrutura(onReordenar = vi.fn(), onSelecionar = vi.fn()) {
  render(
    <EstruturaVitrine fileiras={fileiras} selecionado="destaque" nome="Valmer" onSelecionar={onSelecionar} onReordenar={onReordenar} onAlternarVisivel={vi.fn()} onAdicionar={vi.fn()} />,
  );
  return { onReordenar, onSelecionar };
}

describe("EstruturaVitrine (lista de fileiras)", () => {
  it("reordena pelo teclado (Tab até Descer + Enter) e mostra {nome} com o nome de quem edita", async () => {
    const u = userEvent.setup();
    const { onReordenar, onSelecionar } = estrutura();
    expect(screen.getByText("Continue assistindo, Valmer")).toBeInTheDocument();
    screen.getByRole("button", { name: "Arrastar fileira Continue assistindo, Valmer" }).focus();
    await u.tab(); // título (seleciona)
    await u.keyboard("{Enter}");
    expect(onSelecionar).toHaveBeenLastCalledWith("continuar");
    await u.tab(); // Subir (desabilitado é pulado) → Descer
    expect(screen.getByRole("button", { name: "Descer fileira Continue assistindo, Valmer" })).toHaveFocus();
    await u.keyboard("{Enter}");
    expect(onReordenar).toHaveBeenLastCalledWith([fileiras[1], fileiras[0], fileiras[2]]);
  });

  it("ocultar é um botão com estado e nome acessível", () => {
    estrutura();
    expect(screen.getByRole("button", { name: "Ocultar Top 10 aulas da semana" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("PropriedadesFileira (chips)", () => {
  const montar = (f: FileiraVitrine, onMudar = vi.fn()) => {
    render(<PropriedadesFileira fileira={f} grupos={[{ id: "g1", nome: "Mentoria" }]} rotulos={{}} lembrarRotulo={vi.fn()} onMudar={onMudar} onDuplicar={vi.fn()} onRemover={vi.fn()} />);
    return onMudar;
  };

  it("tipo troca e ajusta a ordenação; quantidade vira número; ordenação só aparece onde cabe", () => {
    const onMudar = montar(fileiras[1]);
    expect(screen.queryByRole("radiogroup", { name: "Ordenação" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Mentorias" }));
    expect(onMudar).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: "MENTORIAS", ordenacao: "RECENTES" }));
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    expect(onMudar).toHaveBeenLastCalledWith(expect.objectContaining({ quantidade: 5 }));
  });

  it("mentorias mostram ordenação; quem vê por grupo marca o primeiro grupo", () => {
    const onMudar = montar({ ...fileiras[0], tipo: "MENTORIAS", ordenacao: "RECENTES" });
    fireEvent.click(screen.getByRole("radio", { name: "Mais assistidos" }));
    expect(onMudar).toHaveBeenLastCalledWith(expect.objectContaining({ ordenacao: "MAIS_ASSISTIDOS" }));
    fireEvent.click(screen.getByRole("radio", { name: "Grupos escolhidos" }));
    expect(onMudar).toHaveBeenLastCalledWith(expect.objectContaining({ grupos: ["g1"] }));
  });
});

describe("Módulos do curso no construtor (RN-271, RN-272)", () => {
  const cursos: CursoDoConstrutor[] = [
    { id: "11111111-1111-4111-8111-111111111111", titulo: "Rascunho", status: "RASCUNHO", descricao: "", modulos: 0, modulosComCapa: 0 },
    { id: "22222222-2222-4222-8222-222222222222", titulo: "Líder na Prática", status: "PUBLICADO", descricao: "", modulos: 3, modulosComCapa: 1 },
  ];

  it("trocar para Módulos do curso escolhe o primeiro curso publicado; o aviso conta os módulos sem capa", () => {
    const onMudar = vi.fn();
    const { unmount } = render(<PropriedadesFileira fileira={fileiras[1]} grupos={[]} cursos={cursos} rotulos={{}} lembrarRotulo={vi.fn()} onMudar={onMudar} onDuplicar={vi.fn()} onRemover={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Módulos do curso" }));
    expect(onMudar).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: "MODULOS", ordenacao: "MANUAL", cursoId: cursos[1].id }));
    unmount();
    render(<PropriedadesFileira fileira={fileiraDeModulos("m", cursos[1].id)} grupos={[]} cursos={cursos} rotulos={{}} lembrarRotulo={vi.fn()} onMudar={onMudar} onDuplicar={vi.fn()} onRemover={vi.fn()} />);
    expect(screen.getByText("Líder na Prática")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 de 3 módulos sem capa");
    expect(screen.getByRole("status")).toHaveTextContent("Envie as capas verticais (3:4) em Conteúdos > módulo");
  });

  it("modelo: escolhe o curso e só pede a confirmação (nada muda antes do modal)", () => {
    const onAplicar = vi.fn();
    render(<ModeloModulos cursos={cursos} fileiras={fileiras} onAplicar={onAplicar} />);
    fireEvent.click(screen.getByRole("button", { name: /Usar modelo: Módulos do curso/ }));
    expect(screen.getByRole("combobox", { name: "Curso" })).toHaveValue(cursos[1].id);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar ao rascunho" }));
    expect(onAplicar).toHaveBeenCalledWith(cursos[1]);
    expect(screen.queryByText(/está em rascunho/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Curso" }), { target: { value: cursos[0].id } });
    expect(screen.getByRole("status")).toHaveTextContent("Este curso está em rascunho: os alunos só veem esta fileira quando você publicar o curso");
  });
});

describe("Status das alterações", () => {
  const padrao = configPadrao({ id: "11111111-1111-4111-8111-111111111111", titulo: "Líder", descricao: null });
  it("padrão, publicado e alterações não publicadas", () => {
    const mudado = { ...padrao, destaque: { ...padrao.destaque, titulo: "Outro" } };
    expect(situacaoDoRascunho(padrao, null, padrao)).toBe("padrao");
    expect(situacaoDoRascunho(mudado, null, padrao)).toBe("alterado");
    expect(situacaoDoRascunho(mudado, mudado, padrao)).toBe("publicado");
    expect(situacaoDoRascunho(padrao, mudado, padrao)).toBe("alterado");
    render(<StatusVitrine situacao="alterado" numero={2} gravacao="salvando" />);
    expect(screen.getByRole("status")).toHaveTextContent("Alterações não publicadas");
    expect(screen.getByRole("status")).toHaveTextContent("Salvando…");
  });

  it("autosave: espera 800 ms parado, grava com a versão e trava no conflito", async () => {
    vi.useFakeTimers();
    const salvar = vi.fn().mockResolvedValueOnce({ ok: true, dados: { versao: "v2" } }).mockResolvedValueOnce({ ok: false, erro: "Outra pessoa alterou a vitrine." });
    const { result } = renderHook(() => useRascunho({ config: padrao, versao: "v1" }, salvar));
    act(() => result.current.mudar((c) => ({ ...c, destaque: { ...c.destaque, titulo: "A" } })));
    act(() => result.current.mudar((c) => ({ ...c, destaque: { ...c.destaque, titulo: "AB" } })));
    expect(salvar).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(ESPERA_AUTOSAVE_MS));
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(salvar.mock.calls[0][0]).toMatchObject({ versao: "v1", config: { destaque: { titulo: "AB" } } });
    expect(result.current).toMatchObject({ versao: "v2", estado: "salvo" });
    act(() => result.current.mudar((c) => ({ ...c, destaque: { ...c.destaque, titulo: "ABC" } })));
    await act(async () => vi.advanceTimersByTimeAsync(ESPERA_AUTOSAVE_MS));
    expect(salvar.mock.calls[1][0].versao).toBe("v2");
    expect(result.current.estado).toBe("conflito");
    act(() => result.current.mudar((c) => ({ ...c, destaque: { ...c.destaque, titulo: "nada" } })));
    expect(result.current.config.destaque.titulo).toBe("ABC"); // travado: não edita mais
    vi.useRealTimers();
  });
});
