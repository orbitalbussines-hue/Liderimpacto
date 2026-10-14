import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatAssistente } from "./chat-assistente";
import { linhasCompletas, type EventoChat, type PedidoChat } from "./stream";

const FONTES = [
  { n: 1, titulo: "Cultura forte", origem: "Líder de Impacto", aulaId: "a1", inicioSeg: 195 },
  { n: 2, titulo: "FAQ", origem: "Texto da equipe", aulaId: null, inicioSeg: null },
];

/** Envio falso: devolve controles para o teste soltar os eventos um a um (streaming simulado). */
function envioControlado() {
  let emitir: (e: EventoChat) => void = () => {};
  let terminar: () => void = () => {};
  const enviar = vi.fn(
    (_p: PedidoChat, aoEvento: (e: EventoChat) => void) =>
      new Promise<void>((r) => {
        emitir = aoEvento;
        terminar = r;
      }),
  );
  return { enviar, emitir: (e: EventoChat) => act(() => emitir(e)), terminar: () => act(async () => terminar()) };
}

describe("ChatAssistente", () => {
  it("envia com Enter, mostra o texto chegando e, no fim, só as fontes citadas com link para o minuto", async () => {
    const s = envioControlado();
    const onConversa = vi.fn();
    render(<ChatAssistente nomeAssistente="Assistente" inicial={null} aulaId="a1" enviar={s.enviar} onConversa={onConversa} avisoPrivacidade />);
    expect(screen.getByText("Suas perguntas podem ser lidas pela equipe para melhorar o curso.")).toBeInTheDocument();
    const campo = screen.getByLabelText("Sua pergunta");
    fireEvent.change(campo, { target: { value: "O que é cultura?" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(s.enviar).toHaveBeenCalledWith({ pergunta: "O que é cultura?", conversaId: null, aulaId: "a1", teste: false }, expect.any(Function), expect.any(AbortSignal));
    expect(screen.getByText("Consultando as aulas…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Parar a resposta" })).toBeInTheDocument();

    s.emitir({ tipo: "inicio", conversaId: "c1", fontes: FONTES, restantes: 19 });
    s.emitir({ tipo: "texto", texto: "Cultura é o jeito " });
    s.emitir({ tipo: "texto", texto: "das coisas [1]." });
    expect(screen.getByRole("log")).toHaveTextContent("Cultura é o jeito das coisas");
    s.emitir({ tipo: "fim", mensagemId: "m1", semResposta: false, citadas: [1], versao: "2026-10-14T10:00:00.000Z" });
    await s.terminar();

    const log = screen.getByRole("log");
    const link = within(log).getByRole("link", { name: /Fonte 1: Líder de Impacto · Cultura forte · 03:15/ });
    expect(link).toHaveAttribute("href", "/aula/a1?t=195");
    expect(within(log).getByText("Fontes")).toBeInTheDocument();
    expect(within(log).queryByText(/FAQ/)).not.toBeInTheDocument();
    expect(screen.getByText("19 perguntas restantes hoje")).toBeInTheDocument();
    expect(onConversa).toHaveBeenCalledWith({ conversaId: "c1", versao: "2026-10-14T10:00:00.000Z" });
  });

  it("a segunda pergunta segue na mesma conversa; recusa antes de começar devolve a pergunta ao campo", async () => {
    const s = envioControlado();
    render(<ChatAssistente nomeAssistente="Assistente" inicial={{ conversaId: "c9", versao: "v", mensagens: [] }} enviar={s.enviar} />);
    const campo = screen.getByLabelText("Sua pergunta");
    fireEvent.change(campo, { target: { value: "Mais uma" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar pergunta" }));
    expect(s.enviar.mock.calls[0][0]).toMatchObject({ conversaId: "c9" });
    s.emitir({ tipo: "erro", mensagem: "Você chegou ao limite de perguntas de hoje." });
    await s.terminar();
    expect(screen.getByRole("alert")).toHaveTextContent("limite de perguntas");
    expect(campo).toHaveValue("Mais uma");
  });

  it("indisponível: mostra o motivo e não deixa perguntar; histórico continua visível como TEXTO", () => {
    render(
      <ChatAssistente
        nomeAssistente="Assistente"
        indisponivel="IA não configurada."
        inicial={{ conversaId: "c1", versao: "v", mensagens: [{ id: "1", papel: "ASSISTENTE", texto: "<b>oi</b> [2]", fontes: FONTES }] }}
      />,
    );
    expect(screen.getByText("IA não configurada.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Sua pergunta")).not.toBeInTheDocument();
    expect(screen.getByText("<b>oi</b>", { exact: false })).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
  });

  it("NDJSON: só linhas completas saem; o resto espera o próximo pedaço", () => {
    expect(linhasCompletas('{"a":1}\n{"b":2}\n{"c"')).toEqual({ linhas: ['{"a":1}', '{"b":2}'], resto: '{"c"' });
  });
});
