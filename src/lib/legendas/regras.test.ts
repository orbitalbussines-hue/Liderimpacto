import { describe, expect, it } from "vitest";
import {
  buscarTrechos,
  decodificarLegenda,
  gerarVtt,
  lerLegenda,
  LIMITES_LEGENDA,
  partesComDestaque,
  processarLegenda,
  sanitizarTexto,
  tempoVtt,
  textoPuro,
  trechoAtual,
} from "./regras";

const bytes = (s: string) => new TextEncoder().encode(s);
const SRT = "1\n00:00:01,000 --> 00:00:03,500\nOlá, <i>turma</i>!\n\n2\n00:00:04,000 --> 00:00:06,000\nLinha um\nLinha dois\n";

describe("lerLegenda", () => {
  it("lê SRT e WebVTT (identificador, NOTE, STYLE, ajustes de posição, hora opcional)", () => {
    expect(lerLegenda(SRT)).toEqual([
      { inicio: 1, fim: 3.5, texto: "Olá, turma!" },
      { inicio: 4, fim: 6, texto: "Linha um\nLinha dois" },
    ]);
    const vtt = "WEBVTT - aula 1\n\nNOTE comentário\nqualquer\n\nSTYLE\n::cue { color: red }\n\nabc\n00:01.000 --> 00:02.000 align:start line:0\n<v Valmer>Bom dia</v>\n";
    expect(lerLegenda(vtt)).toEqual([{ inicio: 1, fim: 2, texto: "Bom dia" }]);
  });

  it("aceita BOM e CRLF/CR", () => {
    expect(lerLegenda(`﻿${SRT.replace(/\n/g, "\r\n")}`)).toHaveLength(2);
    expect(lerLegenda(SRT.replace(/\n/g, "\r"))).toHaveLength(2);
  });

  it("recusa vazio, bloco sem tempo, tempo inválido, invertido e fora de ordem — com a linha", () => {
    expect(() => lerLegenda("")).toThrow(/nenhum trecho/);
    expect(() => lerLegenda("WEBVTT\n")).toThrow(/nenhum trecho/);
    expect(() => lerLegenda("<html><script>alert(1)</script></html>")).toThrow(/Linha 1: trecho sem o tempo/);
    expect(() => lerLegenda("1\n00:00:01 --> 00:00:02\noi")).toThrow(/Linha 2: tempo em formato inválido/);
    expect(() => lerLegenda("1\n00:00:05,000 --> 00:00:02,000\noi")).toThrow(/fim do trecho vem antes/);
    expect(() => lerLegenda("1\n00:00:05,000 --> 00:00:06,000\na\n\n2\n00:00:01,000 --> 00:00:02,000\nb")).toThrow(/Linha 6: .*ordem crescente/);
  });

  it("trecho sem texto (só tag) é descartado; linha gigante e trechos demais são recusados", () => {
    expect(lerLegenda("1\n00:00:01,000 --> 00:00:02,000\n<b></b>\n\n2\n00:00:02,000 --> 00:00:03,000\nfica")).toEqual([{ inicio: 2, fim: 3, texto: "fica" }]);
    expect(() => lerLegenda(`1\n00:00:01,000 --> 00:00:02,000\n${"x".repeat(200_000)}`)).toThrow(/longo demais/);
    const muitos = Array.from({ length: 50_000 }, (_, i) => `${tempoVtt(i)} --> ${tempoVtt(i + 0.5)}\nt`).join("\n\n");
    expect(() => lerLegenda(`WEBVTT\n\n${muitos}`)).toThrow(/trechos demais/);
  });
});

describe("sanitizarTexto e gerarVtt (entrada hostil)", () => {
  it("tira toda tag e decodifica entidades DEPOIS (o resultado é só texto)", () => {
    expect(sanitizarTexto('<script>alert("x")</script>oi')).toBe('alert("x")oi');
    expect(sanitizarTexto("<c.amarelo>a</c> <b>b</b> <00:00:01.000>c {\\an8}d")).toBe("a b c d");
    expect(sanitizarTexto("&lt;img src=x onerror=alert(1)&gt; &amp; &#60;b&#62; &#x3c;i&#x3e;")).toBe("<img src=x onerror=alert(1)> & <b> <i>");
    expect(sanitizarTexto("a​b‮c\u0000d")).toBe("abcd");
    expect(sanitizarTexto("javascript:alert(1)")).toBe("javascript:alert(1)");
  });

  it("o .vtt gerado não tem nenhuma tag nem quebra a estrutura (texto escapado)", () => {
    const trechos = lerLegenda("1\n00:00:01,000 --> 00:00:02,000\n&lt;script&gt;x --> y&lt;/script&gt;\n");
    const vtt = gerarVtt(trechos);
    expect(vtt).toBe("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n&lt;script&gt;x --&gt; y&lt;/script&gt;\n");
    expect(vtt).not.toMatch(/<[a-z/]/i);
    // Ida e volta: o .vtt normalizado lido de novo dá os mesmos trechos (a aba Transcrição lê assim).
    expect(lerLegenda(vtt)).toEqual(trechos);
  });

  it("tempoVtt e textoPuro", () => {
    expect(tempoVtt(3725.5)).toBe("01:02:05.500");
    expect(tempoVtt(0.001)).toBe("00:00:00.001");
    expect(textoPuro([{ inicio: 0, fim: 1, texto: "a\nb" }, { inicio: 1, fim: 2, texto: "c" }])).toBe("a b\nc");
  });
});

describe("decodificarLegenda e processarLegenda", () => {
  it("UTF-8 com BOM, Windows-1252 e UTF-16 com BOM", () => {
    expect(decodificarLegenda(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes("ação")]))).toBe("ação");
    expect(decodificarLegenda(new Uint8Array([0x61, 0xe7, 0xe3, 0x6f]))).toBe("ação"); // latin1/1252
    expect(decodificarLegenda(new Uint8Array([0x93, 0x6f, 0x69, 0x94]))).toBe("“oi”"); // aspas do 1252
    expect(decodificarLegenda(new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0xe7, 0x00]))).toBe("aç");
  });

  it("processa: vtt + texto + contagem + duração; recusa vazio, grande e além do vídeo", () => {
    const r = processarLegenda(bytes(SRT), 60);
    expect(r).toMatchObject({ trechos: 2, duracaoSeg: 6, texto: "Olá, turma!\nLinha um Linha dois" });
    expect(r.vtt.startsWith("WEBVTT\n\n00:00:01.000 --> 00:00:03.500\n")).toBe(true);
    expect(() => processarLegenda(new Uint8Array(), 60)).toThrow(/vazio/);
    expect(() => processarLegenda(new Uint8Array(LIMITES_LEGENDA.bytes + 1), 60)).toThrow(/grande demais/);
    expect(() => processarLegenda(bytes("1\n00:02:00,000 --> 00:02:01,000\noi"), 100)).toThrow(/vai até 02:01, mas o vídeo tem 01:40/);
    expect(processarLegenda(bytes("1\n00:01:45,000 --> 00:01:49,000\noi"), 100).duracaoSeg).toBe(109); // folga de 10 s
    expect(processarLegenda(bytes("1\n00:02:00,000 --> 00:02:01,000\noi"), null).trechos).toBe(1); // sem vídeo ainda
  });
});

describe("busca e trecho atual (aba Transcrição)", () => {
  const trechos = [
    { inicio: 0, fim: 2, texto: "A AÇÃO do líder" },
    { inicio: 2, fim: 4, texto: "cultura forte" },
    { inicio: 4, fim: 6, texto: "Acao e reação" },
  ];

  it("busca sem acento e sem caixa; termo vazio = todos", () => {
    expect(buscarTrechos(trechos, "acao")).toEqual([0, 2]);
    expect(buscarTrechos(trechos, "  CULTURA ")).toEqual([1]);
    expect(buscarTrechos(trechos, "")).toEqual([0, 1, 2]);
    expect(buscarTrechos(trechos, "nada")).toEqual([]);
  });

  it("destaca o termo no texto original (com acento)", () => {
    expect(partesComDestaque("A AÇÃO e a ação", "acao")).toEqual([
      { texto: "A ", destaque: false },
      { texto: "AÇÃO", destaque: true },
      { texto: " e a ", destaque: false },
      { texto: "ação", destaque: true },
    ]);
    expect(partesComDestaque("sem termo", "")).toEqual([{ texto: "sem termo", destaque: false }]);
    expect(partesComDestaque("x", "y")).toEqual([{ texto: "x", destaque: false }]);
  });

  it("trechoAtual: o último que já começou", () => {
    expect(trechoAtual(trechos, -1)).toBe(-1);
    expect(trechoAtual(trechos, 0)).toBe(0);
    expect(trechoAtual(trechos, 3.9)).toBe(1);
    expect(trechoAtual(trechos, 99)).toBe(2);
    expect(trechoAtual([], 5)).toBe(-1);
  });
});
