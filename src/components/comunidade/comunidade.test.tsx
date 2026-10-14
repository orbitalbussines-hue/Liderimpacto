import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutorPublico, ComentarioDaArvore, EnqueteDoPost } from "@/lib/comunidade/consultas";
import { BotaoCurtir } from "./botao-curtir";
import { Comentarios } from "./comentarios";
import { EnquetePost } from "./extras-post";
import { aplicarVoto, estadoDoCompositor, quando } from "./formatos";
import { TextoComLinks } from "./texto-com-links";

const acoes = vi.hoisted(() => ({
  acaoCurtir: vi.fn(),
  acaoVotarEnquete: vi.fn(),
  acaoComentar: vi.fn(),
  acaoEditarComentario: vi.fn(),
  acaoRemoverComentario: vi.fn(),
  acaoRemoverPublicacao: vi.fn(),
  acaoDenunciar: vi.fn(),
  acaoLinkDoAnexo: vi.fn(),
}));
vi.mock("@/lib/actions/comunidade", () => acoes);
vi.mock("@/lib/actions/comunidade-moderacao", () => ({ acaoFixarPublicacao: vi.fn(), acaoOcultar: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

beforeEach(() => Object.values(acoes).forEach((f) => f.mockReset()));

describe("TextoComLinks (texto puro, nunca HTML)", () => {
  it("transforma só http(s) em link com rel e target seguros", () => {
    render(<TextoComLinks texto="Veja https://exemplo.com/aula. E javascript:alert(1) fica texto." />);
    const link = screen.getByRole("link", { name: "https://exemplo.com/aula" });
    expect(link).toHaveAttribute("href", "https://exemplo.com/aula");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText(/javascript:alert\(1\) fica texto\./)).toBeInTheDocument();
  });

  it("HTML literal aparece como texto e não vira elemento", () => {
    const { container } = render(<TextoComLinks texto={'<b>negrito</b> <img src=x onerror="alert(1)">'} />);
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe('<b>negrito</b> <img src=x onerror="alert(1)">');
  });
});

describe("BotaoCurtir (otimista)", () => {
  it("muda na hora e fica com o número do servidor", async () => {
    let responder: (v: unknown) => void = () => {};
    acoes.acaoCurtir.mockReturnValue(new Promise((r) => (responder = r)));
    render(<BotaoCurtir alvo={{ postId: "p1" }} curtiu={false} curtidas={4} />);
    fireEvent.click(screen.getByRole("button", { name: /Curtir/ }));
    expect(screen.getByRole("button", { pressed: true })).toHaveTextContent("5 curtidas");
    expect(acoes.acaoCurtir).toHaveBeenCalledWith({ postId: "p1" });
    responder({ ok: true, dados: { curtiu: true, curtidas: 7 } });
    await waitFor(() => expect(screen.getByRole("button", { pressed: true })).toHaveTextContent("7 curtidas"));
  });

  it("volta ao estado anterior e avisa quando a action recusa", async () => {
    acoes.acaoCurtir.mockResolvedValue({ ok: false, erro: "Publicação não encontrada." });
    render(<BotaoCurtir alvo={{ comentarioId: "c1" }} curtiu curtidas={3} />);
    fireEvent.click(screen.getByRole("button", { name: /Descurtir/ }));
    expect(screen.getByRole("button", { pressed: false })).toHaveTextContent("2 curtidas");
    await waitFor(() => expect(screen.getByRole("button", { pressed: true })).toHaveTextContent("3 curtidas"));
    expect(screen.getByRole("status")).toHaveTextContent("Publicação não encontrada.");
  });
});

const enquete: EnqueteDoPost = {
  pergunta: "Melhor dia da mentoria?",
  opcoes: [
    { indice: 0, texto: "Terça", votos: 2 },
    { indice: 1, texto: "Quinta", votos: 1 },
  ],
  totalVotos: 3,
  meuVoto: null,
  encerraEm: null,
  aberta: true,
};

describe("Enquete", () => {
  it("aplicarVoto soma no primeiro voto e move ao trocar", () => {
    const votou = aplicarVoto(enquete, 1);
    expect(votou.totalVotos).toBe(4);
    expect(votou.opcoes.map((o) => o.votos)).toEqual([2, 2]);
    const trocou = aplicarVoto(votou, 0);
    expect(trocou.totalVotos).toBe(4);
    expect(trocou.opcoes.map((o) => o.votos)).toEqual([3, 1]);
    expect(trocou.meuVoto).toBe(0);
    expect(aplicarVoto(trocou, 0)).toBe(trocou);
  });

  it("vota, mostra as barras e troca o voto", async () => {
    acoes.acaoVotarEnquete.mockResolvedValue({ ok: true, dados: { opcao: 1 } });
    render(<EnquetePost postId="p1" inicial={enquete} podeVotar />);
    expect(screen.queryByText("50%")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Quinta/ }));
    expect(screen.getByRole("button", { name: /Quinta/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("50%")).toHaveLength(2);
    await waitFor(() => expect(acoes.acaoVotarEnquete).toHaveBeenCalledWith({ postId: "p1", opcao: 1 }));
    fireEvent.click(screen.getByRole("button", { name: /Terça/ }));
    expect(screen.getByText("75%")).toBeInTheDocument();
    await waitFor(() => expect(acoes.acaoVotarEnquete).toHaveBeenLastCalledWith({ postId: "p1", opcao: 0 }));
  });

  it("volta o voto se a action recusar; encerrada só mostra o resultado", async () => {
    acoes.acaoVotarEnquete.mockResolvedValue({ ok: false, erro: "A enquete foi encerrada." });
    const { unmount } = render(<EnquetePost postId="p1" inicial={enquete} podeVotar />);
    fireEvent.click(screen.getByRole("button", { name: /Terça/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("A enquete foi encerrada."));
    expect(screen.getByRole("button", { name: /Terça/ })).toHaveAttribute("aria-pressed", "false");
    unmount();
    render(<EnquetePost postId="p1" inicial={{ ...enquete, aberta: false }} podeVotar />);
    expect(screen.getByRole("button", { name: /Terça/ })).toBeDisabled();
    expect(screen.getByText(/encerrada/)).toBeInTheDocument();
  });
});

const eu: AutorPublico = { membroId: "m-eu", nome: "Ana Demo", iniciais: "AD", imagem: null, equipe: false };
const comentario = (id: string, autor: string, texto: string, respostas: ComentarioDaArvore[] = []): ComentarioDaArvore => ({
  id,
  autor: { membroId: `m-${id}`, nome: autor, iniciais: "XX", imagem: null, equipe: false },
  texto,
  criadoEm: new Date(Date.now() - 3_600_000),
  editadoEm: null,
  oculto: null,
  curtidas: 0,
  curtiu: false,
  podeEditar: false,
  podeRemover: false,
  podeModerar: false,
  versao: "2026-10-14T12:00:00.000Z",
  respostas,
});

describe("Comentarios (1 nível de resposta)", () => {
  it("mostra comentário com resposta e responde sem recarregar", async () => {
    acoes.acaoComentar.mockResolvedValue({ ok: true, dados: { id: "novo", versao: "2026-10-14T13:00:00.000Z" } });
    const total = vi.fn();
    render(<Comentarios alvo={{ aulaId: "a1" }} iniciais={[comentario("c1", "Bruno Lima", "Ótima aula", [comentario("r1", "Carla Souza", "Concordo")])]} eu={eu} aoMudarTotal={total} />);
    const itens = screen.getAllByRole("listitem");
    expect(itens[0]).toHaveTextContent("Ótima aula");
    expect(within(itens[0]).getByText("Concordo")).toBeInTheDocument();
    // Resposta não tem "Responder" (1 nível só): um botão, o do comentário principal.
    expect(screen.getAllByRole("button", { name: "Responder" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Responder a Bruno Lima" }), { target: { value: "Também achei" } });
    fireEvent.submit(screen.getByRole("textbox", { name: "Responder a Bruno Lima" }).closest("form")!);
    await waitFor(() => expect(screen.getByText("Também achei")).toBeInTheDocument());
    expect(acoes.acaoComentar).toHaveBeenCalledWith({ aulaId: "a1", texto: "Também achei", paiId: "c1" });
    expect(total).toHaveBeenCalledWith(1);
    expect(screen.queryByRole("textbox", { name: "Responder a Bruno Lima" })).toBeNull();
  });

  it("silenciado vê o aviso e não tem campo para comentar", () => {
    render(<Comentarios alvo={{ postId: "p1" }} iniciais={[]} eu={eu} bloqueio="Você está silenciado na comunidade até 20/10 às 18:00." />);
    expect(screen.getByRole("status")).toHaveTextContent("silenciado");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("formatos", () => {
  it("quando: relativo como no protótipo", () => {
    const agora = new Date("2026-10-14T12:00:00Z");
    expect(quando(new Date("2026-10-14T11:59:30Z"), agora)).toBe("agora");
    expect(quando(new Date("2026-10-14T09:00:00Z"), agora)).toBe("há 3 h");
    expect(quando(new Date("2026-09-29T12:00:00Z"), agora)).toBe("há 15 dias");
    expect(quando(new Date("2026-09-10T12:00:00Z"), agora)).toBe("há um mês");
  });

  it("estadoDoCompositor: avisos só para a equipe, silenciado e sem vínculo", () => {
    const livre = { podeParticipar: true, silenciadoAte: null };
    expect(estadoDoCompositor(livre, { podePublicar: true }, 3)).toBe("livre");
    expect(estadoDoCompositor(livre, { podePublicar: false }, 3)).toBe("so-equipe");
    expect(estadoDoCompositor(livre, null, 0)).toBe("so-equipe");
    expect(estadoDoCompositor({ podeParticipar: true, silenciadoAte: new Date() }, { podePublicar: true }, 3)).toBe("silenciado");
    expect(estadoDoCompositor({ podeParticipar: false, silenciadoAte: null }, null, 0)).toBe("sem-vinculo");
  });
});
