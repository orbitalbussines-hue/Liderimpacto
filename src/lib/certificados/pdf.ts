import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { encode } from "uqr";
import type { DadosCertificado } from "@/lib/db/schema/certificados";
import { codigoLegivel, dataPorExtenso } from "./regras";

/**
 * PDF do certificado (ADR-0008): pdf-lib (JS puro, sem navegador nem binário), A4 paisagem, fontes
 * do design (Newsreader + Plus Jakarta Sans, OFL) lidas dos pacotes `@fontsource/*` em WOFF 1 —
 * o fontkit do pdf-lib lê WOFF; o WOFF2 quebra no subset. QR desenhado com o `uqr` (já no projeto).
 * Roda SÓ no worker (`npm run worker:certificados`) e nos testes, nunca no Next.
 *
 * ponytail: só o subconjunto "latin" das fontes (pt-BR inteiro cabe); letra fora dele (ex.: "ł")
 * sai como glifo vazio. Somar os arquivos latin-ext se aparecer nome assim.
 */

const FONTES = {
  titulo: "@fontsource/newsreader/files/newsreader-latin-600-normal.woff",
  tituloItalico: "@fontsource/newsreader/files/newsreader-latin-400-italic.woff",
  texto: "@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-400-normal.woff",
  forte: "@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-700-normal.woff",
} as const;

/** Worker, testes e seed rodam da raiz do projeto (o Next nunca importa este arquivo). */
const RAIZ_MODULOS = join(process.cwd(), "node_modules");

let cacheFontes: Promise<Record<keyof typeof FONTES, Uint8Array>> | null = null;
const lerFontes = () =>
  (cacheFontes ??= Promise.all(Object.entries(FONTES).map(async ([k, f]) => [k, new Uint8Array(await readFile(join(RAIZ_MODULOS, f)))] as const)).then(
    (pares) => Object.fromEntries(pares) as Record<keyof typeof FONTES, Uint8Array>,
  ));

const A4_PAISAGEM: [number, number] = [841.89, 595.28];
const TINTA = rgb(0.13, 0.12, 0.11);
const SUAVE = rgb(0.42, 0.4, 0.37);
const PAPEL = rgb(1, 0.992, 0.973);

function corRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const c = h.length === 3 ? h.replace(/./g, (x) => x + x) : h;
  return rgb(parseInt(c.slice(0, 2), 16) / 255, parseInt(c.slice(2, 4), 16) / 255, parseInt(c.slice(4, 6), 16) / 255);
}

/** Quebra o texto em linhas de no máximo `largura`. */
function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (atual && fonte.widthOfTextAtSize(tentativa, tamanho) > largura) {
      linhas.push(atual);
      atual = palavra;
    } else atual = tentativa;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function centralizado(p: PDFPage, texto: string, y: number, fonte: PDFFont, tamanho: number, cor: RGB, cx = A4_PAISAGEM[0] / 2) {
  p.drawText(texto, { x: cx - fonte.widthOfTextAtSize(texto, tamanho) / 2, y, size: tamanho, font: fonte, color: cor });
}

/** Reduz o corpo até caber em `largura` (nome muito longo). */
function corpoQueCabe(texto: string, fonte: PDFFont, maximo: number, largura: number): number {
  let t = maximo;
  while (t > 18 && fonte.widthOfTextAtSize(texto, t) > largura) t -= 1;
  return t;
}

function desenharQr(p: PDFPage, texto: string, x: number, y: number, lado: number, cor: RGB) {
  const { data, size } = encode(texto, { border: 0 });
  const modulo = lado / size;
  data.forEach((linha, i) =>
    linha.forEach((preto, j) => {
      if (preto) p.drawRectangle({ x: x + j * modulo, y: y + lado - (i + 1) * modulo, width: modulo + 0.05, height: modulo + 0.05, color: cor });
    }),
  );
}

/** Gera o PDF (bytes). Determinístico para os mesmos dados, exceto metadados de data. */
export async function gerarPdfCertificado(d: DadosCertificado): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const bytes = await lerFontes();
  const [titulo, italico, texto, forte] = await Promise.all([
    doc.embedFont(bytes.titulo, { subset: true }),
    doc.embedFont(bytes.tituloItalico, { subset: true }),
    doc.embedFont(bytes.texto, { subset: true }),
    doc.embedFont(bytes.forte, { subset: true }),
  ]);
  doc.setTitle(`${d.titulo} · ${d.nome} · ${d.curso}`);
  doc.setAuthor(d.criador);
  doc.setSubject(`Código de verificação ${d.codigo}`);
  doc.setProducer("Líder de Impacto · Sistema de Aulas");

  const [W, H] = A4_PAISAGEM;
  const cor = corRgb(d.cor);
  const p = doc.addPage(A4_PAISAGEM);
  p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPEL });
  p.drawRectangle({ x: 22, y: 22, width: W - 44, height: H - 44, borderColor: cor, borderWidth: 2.2 });
  p.drawRectangle({ x: 30, y: 30, width: W - 60, height: H - 60, borderColor: cor, borderWidth: 0.6, opacity: 0 });
  // Faixa vertical da marca à esquerda.
  p.drawRectangle({ x: 30, y: 30, width: 10, height: H - 60, color: cor });

  // Marca (logo em texto) e título.
  centralizado(p, d.criador.toUpperCase(), H - 92, titulo, 15, cor);
  p.drawLine({ start: { x: W / 2 - 28, y: H - 104 }, end: { x: W / 2 + 28, y: H - 104 }, thickness: 1, color: cor });
  centralizado(p, d.titulo.toUpperCase(), H - 140, forte, 13, SUAVE);

  // "Certificamos que" / NOME / restante do texto (o modelo sempre tem {nome}).
  const i = d.texto.indexOf(d.nome);
  const antes = (i >= 0 ? d.texto.slice(0, i) : "").trim();
  const depois = (i >= 0 ? d.texto.slice(i + d.nome.length) : d.texto).trim().replace(/^[,.;:]\s*/, "");
  if (antes) centralizado(p, antes, H - 190, italico, 17, SUAVE);
  const corpoNome = corpoQueCabe(d.nome, titulo, 44, W - 220);
  centralizado(p, d.nome, H - 250, titulo, corpoNome, TINTA);
  p.drawLine({ start: { x: W / 2 - 170, y: H - 266 }, end: { x: W / 2 + 170, y: H - 266 }, thickness: 0.6, color: cor });
  quebrar(depois, texto, 13, W - 260).forEach((linha, n) => centralizado(p, linha, H - 302 - n * 20, texto, 13, TINTA));

  // Rodapé: QR + verificação à esquerda, assinatura à direita.
  const base = 64;
  desenharQr(p, d.urlVerificacao, 70, base, 78, TINTA);
  p.drawText("Verifique a autenticidade", { x: 162, y: base + 62, size: 9, font: forte, color: SUAVE });
  p.drawText(`Código ${codigoLegivel(d.codigo)}`, { x: 162, y: base + 44, size: 12, font: forte, color: TINTA });
  const url = d.urlVerificacao.replace(/^https:\/\//, "");
  p.drawText(url, { x: 162, y: base + 28, size: corpoQueCabe(url, texto, 9, 260), font: texto, color: SUAVE });
  p.drawText(`Concluído em ${dataPorExtenso(new Date(d.concluidoEm))}`, { x: 162, y: base + 12, size: 9, font: texto, color: SUAVE });

  const ax = W - 250;
  p.drawLine({ start: { x: ax - 100, y: base + 40 }, end: { x: ax + 100, y: base + 40 }, thickness: 0.8, color: TINTA });
  centralizado(p, d.assinaturaNome, base + 22, forte, 12, TINTA, ax);
  if (d.assinaturaCargo) centralizado(p, d.assinaturaCargo, base + 6, texto, 10, SUAVE, ax);

  return doc.save();
}
