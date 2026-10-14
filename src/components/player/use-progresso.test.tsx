import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { esquemaBatida } from "@/lib/progresso/regras";
import { useProgresso, type ProgressoDaBatida } from "./use-progresso";

const acao = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/progresso", () => ({ acaoRegistrarProgresso: acao }));

const AULA = "5f0c2a7e-2f7b-4f32-9b1e-0a5e2b1c9d10";

function Sonda({ aoGravar }: { aoGravar: (p: ProgressoDaBatida) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useProgresso(ref, { aulaId: AULA, duracaoSeg: 600, ativo: true, aoGravar });
  return <video ref={ref} data-testid="v" />;
}

/** O jsdom não toca vídeo: o estado vem por propriedades graváveis e os eventos à mão. */
function vidro(v: HTMLVideoElement) {
  const estado = { paused: true, seeking: false, ended: false, readyState: 4, currentTime: 0, duration: 600 };
  for (const k of Object.keys(estado) as (keyof typeof estado)[]) {
    Object.defineProperty(v, k, { configurable: true, get: () => estado[k], set: (x) => ((estado as Record<string, unknown>)[k] = x) });
  }
  const em = (nome: string) => v.dispatchEvent(new Event(nome));
  return {
    estado,
    tocar(de: number, ate: number) {
      estado.paused = false;
      for (let t = de; t <= ate; t += 0.25) {
        estado.currentTime = t;
        em("timeupdate");
      }
    },
    em,
  };
}

async function corposDoBeacon(beacon: ReturnType<typeof vi.fn>) {
  return Promise.all(beacon.mock.calls.map(async ([url, blob]) => ({ url, corpo: JSON.parse(await (blob as Blob).text()), tipo: (blob as Blob).type })));
}

describe("useProgresso", () => {
  let beacon: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
    beacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
    acao.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("no pause manda por beacon só o que tocou (o seek não conta), dentro do contrato", async () => {
    const { getByTestId } = render(<Sonda aoGravar={() => {}} />);
    const v = vidro(getByTestId("v") as HTMLVideoElement);
    v.tocar(10, 20);
    v.estado.seeking = true;
    v.em("seeking");
    v.estado.currentTime = 400; // salto: não conta
    v.estado.seeking = false;
    vi.advanceTimersByTime(3500);
    v.em("seeked");
    v.tocar(400, 404);
    vi.advanceTimersByTime(3500);
    v.estado.paused = true;
    v.em("pause");
    const enviados = await corposDoBeacon(beacon);
    expect(enviados.map((e) => e.url)).toEqual(["/api/progresso", "/api/progresso"]);
    expect(enviados[0].corpo.intervalos).toEqual([[10, 20]]);
    expect(enviados[1].corpo.intervalos).toEqual([[400, 404]]);
    expect(enviados[1].corpo.posicao).toBe(404);
    for (const e of enviados) {
      expect(e.tipo).toContain("text/plain");
      expect(esquemaBatida.safeParse(e.corpo).success).toBe(true);
    }
  });

  it("a cada 10 s tocando usa a action e repassa a resposta (conclusão)", async () => {
    acao.mockResolvedValue({ ok: true, dados: { situacao: "registrada", progresso: { percentual: 91, concluida: true, concluiuAgora: true } } });
    const aoGravar = vi.fn();
    const { getByTestId } = render(<Sonda aoGravar={aoGravar} />);
    const v = vidro(getByTestId("v") as HTMLVideoElement);
    v.tocar(0, 9.75);
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(acao).toHaveBeenCalledTimes(1);
    expect(acao.mock.calls[0][0]).toMatchObject({ aulaId: AULA, intervalos: [[0, 9.75]], duracaoSeg: 600 });
    expect(aoGravar).toHaveBeenCalledWith(expect.objectContaining({ concluida: true, concluiuAgora: true }));
    expect(beacon).not.toHaveBeenCalled();
  });

  it("ignorada pelo servidor: os trechos voltam e seguem na próxima batida", async () => {
    acao.mockResolvedValueOnce({ ok: true, dados: { situacao: "ignorada" } });
    const { getByTestId } = render(<Sonda aoGravar={() => {}} />);
    const v = vidro(getByTestId("v") as HTMLVideoElement);
    v.tocar(0, 5);
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    vi.advanceTimersByTime(3500); // pause logo após a batida esperaria a próxima
    v.estado.paused = true;
    v.em("pause");
    const [e] = await corposDoBeacon(beacon);
    expect(e.corpo.intervalos).toEqual([[0, 5]]);
  });

  it("ao esconder a aba e ao sair da aula manda o que falta (mesmo perto da batida anterior)", async () => {
    const { getByTestId, unmount } = render(<Sonda aoGravar={() => {}} />);
    const v = vidro(getByTestId("v") as HTMLVideoElement);
    v.tocar(0, 2);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    v.tocar(2.25, 3);
    unmount();
    const enviados = await corposDoBeacon(beacon);
    expect(enviados.map((e) => e.corpo.intervalos)).toEqual([[[0, 2]], [[2, 3]]]);
  });
});
