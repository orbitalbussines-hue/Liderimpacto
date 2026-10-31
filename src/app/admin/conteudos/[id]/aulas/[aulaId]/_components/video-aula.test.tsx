import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { comTokenAtual } from "@/components/video/player-hls";
import type { EstadoVideo } from "@/lib/video/provedor";
import { VideoAula } from "./video-aula";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const acoes = vi.hoisted(() => ({
  acaoReprocessarVideo: vi.fn(async () => ({ ok: true as const, dados: { enfileirado: true } })),
  acaoIniciarReproducao: vi.fn(async () => ({ ok: false as const, erro: "Sem permissão para esta ação." })),
  acaoRenovarReproducao: vi.fn(),
  acaoIniciarEnvioVideo: vi.fn(),
  acaoAssinarPartesVideo: vi.fn(),
  acaoConcluirEnvioVideo: vi.fn(),
  acaoCancelarEnvioVideo: vi.fn(),
  acaoReaproveitarVideo: vi.fn(async () => ({ ok: true as const, dados: { videoId: "v-2" } })),
}));
vi.mock("@/lib/actions/videos", () => acoes);

const base: EstadoVideo = { videoId: "v-1", situacao: "PRONTO", nomeOriginal: "aula-01.mp4", tamanhoBytes: 5 * 1024 * 1024, duracaoSeg: 125, resolucoes: ["720p", "480p"], erro: null, tentativas: 1 };
const props = { aulaId: "a-1", poster: null, marcaDagua: "Ana · ana@exemplo.com" };

describe("VideoAula (editor da aula)", () => {
  it("sem vídeo: estado vazio com a regra do arquivo e o botão de envio", () => {
    render(<VideoAula {...props} estado={null} />);
    expect(screen.getByText("Sem vídeo")).toBeInTheDocument();
    expect(screen.getByText(/MP4, MOV, MKV ou WebM até 10 GB/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Enviar vídeo/ })).toBeInTheDocument();
  });

  it("usar vídeo de outra aula: escolhe na lista e aplica sem envio (aula sem vídeo, sem modal)", async () => {
    const opcoes = [{ valor: "v-9", rotulo: "Módulo 1 · Abertura (02:05)", grupo: "Curso A" }];
    render(<VideoAula {...props} estado={null} reaproveitaveis={opcoes} />);
    await userEvent.click(screen.getByRole("button", { name: /Usar vídeo de outra aula/ }));
    const usar = screen.getByRole("button", { name: /Usar este vídeo/ });
    expect(usar).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText("Vídeo de outra aula"), "v-9");
    await userEvent.click(usar);
    expect(acoes.acaoReaproveitarVideo).toHaveBeenCalledWith({ aulaId: "a-1", videoOrigemId: "v-9", substituir: false });
  });

  it("sem vídeos em outras aulas: não oferece reaproveitar", () => {
    render(<VideoAula {...props} estado={null} />);
    expect(screen.queryByRole("button", { name: /Usar vídeo de outra aula/ })).not.toBeInTheDocument();
  });

  it("pronto: situação, detalhes, prévia, trocar e reprocessar", async () => {
    render(<VideoAula {...props} estado={base} />);
    expect(screen.getByText("Pronto")).toBeInTheDocument();
    expect(screen.getByText(/aula-01\.mp4 · 5 MB · 02:05 · 720p, 480p/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Assistir prévia/ }));
    expect(acoes.acaoIniciarReproducao).toHaveBeenCalledWith({ aulaId: "a-1" });
    expect(await screen.findByText("Sem permissão para esta ação.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Reprocessar/ }));
    expect(acoes.acaoReprocessarVideo).toHaveBeenCalledWith({ videoId: "v-1" });
  });

  it("trocar abre o modal block (3 s travado) antes de escolher o arquivo", async () => {
    render(<VideoAula {...props} estado={base} />);
    await userEvent.click(screen.getByRole("button", { name: /Trocar vídeo/ }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/sai da aula e é apagado do armazenamento/);
    expect(screen.getByRole("button", { name: /Escolher novo vídeo/ })).toBeDisabled();
  });

  it("falhou: mostra o erro legível; processando: aviso de conversão", () => {
    const { rerender } = render(<VideoAula {...props} estado={{ ...base, situacao: "FALHOU", erro: "O arquivo não parece ser um vídeo válido." }} />);
    expect(screen.getByText("Falhou")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("O arquivo não parece ser um vídeo válido.");
    rerender(<VideoAula {...props} key="p" estado={{ ...base, situacao: "PROCESSANDO", duracaoSeg: null, resolucoes: [] }} />);
    expect(screen.getByText(/convertendo para streaming protegido/)).toBeInTheDocument();
  });

  it("envio interrompido (página recarregada no meio): oferece cancelar", () => {
    render(<VideoAula {...props} estado={{ ...base, situacao: "ENVIANDO", duracaoSeg: null, resolucoes: [] }} />);
    expect(screen.getByText(/foi interrompido/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancelar envio/ })).toBeInTheDocument();
  });
});

describe("comTokenAtual (xhrSetup do PlayerHls)", () => {
  it("troca só o t= e mantém o resto da URL", () => {
    expect(comTokenAtual("/api/video/v/hls/720p/seg_00001.ts?t=velho", "novo", "http://a.localhost:3011/admin")).toBe("http://a.localhost:3011/api/video/v/hls/720p/seg_00001.ts?t=novo");
    expect(comTokenAtual("http://s3.local/x.ts?X-Amz-Signature=abc", "novo", "http://a.localhost:3011/")).toBe("http://s3.local/x.ts?X-Amz-Signature=abc");
  });
});
