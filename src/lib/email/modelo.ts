import { urlDaArea } from "@/lib/criador/host";
import { PALETA_PADRAO, contraste, gerarPaleta, validarHex } from "@/lib/marca/paleta";

/**
 * Modelo UNICO dos e-mails do sistema (puro, sem servidor): devolve `{ html, texto }` para o
 * multipart de `enviarEmail`. HTML de e-mail de verdade: tabelas, CSS inline, 600 px, sem
 * imagem obrigatoria (wordmark em texto ate o logo chegar). Fundo claro com cor explicita em
 * todo bloco que leva texto: o modo escuro do Gmail/Apple Mail nunca deixa texto escuro sobre
 * transparente. Todo texto dinamico e escapado; URL so https (ou http://localhost em dev).
 */

export const NOME_PLATAFORMA = "Líder de Impacto";

export interface Marca {
  /** Nome da area (criador do host) ou "Líder de Impacto". */
  nome: string;
  /** Hex da marca; vazio ou invalido = dourado da plataforma. */
  cor?: string | null;
  /** Origem da area (rodape). */
  url: string;
  /** Futuro: logo hospedado (https). Sem ele, wordmark em texto. */
  logoUrl?: string | null;
}

export interface ConteudoEmail {
  marca: Marca;
  titulo: string;
  /** Pre-cabecalho: a linha que o cliente mostra ao lado do assunto. */
  previa: string;
  /** Nome da pessoa; a saudacao usa so o primeiro nome. */
  nome?: string | null;
  paragrafos: string[];
  botao?: { texto: string; url: string };
  /** Linha discreta abaixo do botao (ex.: validade do link). */
  observacao?: string;
  /** Rodape: "Você recebeu este e-mail porque ...". */
  motivo: string;
}

/** Marca pela cascata plataforma -> criador do host (a mesma da area do aluno). */
export function marcaDaArea(criador: { nome: string; slug: string; cor_marca: string | null } | null, urlPlataforma: string): Marca {
  if (!criador) return { nome: NOME_PLATAFORMA, cor: PALETA_PADRAO, url: urlDaArea(urlPlataforma, null) };
  return { nome: criador.nome, cor: criador.cor_marca ?? PALETA_PADRAO, url: urlDaArea(urlPlataforma, criador.slug) };
}

export const primeiroNome = (nome?: string | null) => (nome ?? "").trim().split(/\s+/)[0] ?? "";

export function escaparHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** https sempre; http so para localhost (dev). Qualquer outra coisa lanca (nunca vira href). */
export function urlSegura(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("URL inválida no e-mail.");
  }
  const local = u.hostname === "localhost" || u.hostname.endsWith(".localhost");
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) throw new Error("URL do e-mail precisa ser https.");
  if (u.username || u.password) throw new Error("URL do e-mail não pode levar credencial.");
  return u.href;
}

/** Cor do botao (accent do tema claro: contraste >= 3:1 com o branco) e tinta pelo contraste. */
export function coresDoBotao(cor?: string | null): { fundo: string; tinta: string } {
  const hex = (cor && validarHex(cor)) || PALETA_PADRAO;
  const { light } = gerarPaleta(hex);
  const fundo = light["--accent"];
  const tinta = light["--accent-ink"];
  // Texto de 16px pede 4.5:1. Tom medio (nem a tinta escura nem a branca chegam): escurece ate o branco chegar.
  if (contraste(fundo, tinta) >= 4.5) return { fundo, tinta };
  let f = fundo;
  while (contraste(f, "#ffffff") < 4.5) {
    const n = Number.parseInt(f.slice(1), 16);
    f = `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.floor(v * 0.96).toString(16).padStart(2, "0")).join("")}`;
  }
  return { fundo: f, tinta: "#ffffff" };
}

const C = { fundo: "#f5f4ef", cartao: "#ffffff", borda: "#e3e0d6", texto: "#14131a", corpo: "#3b3944", suave: "#6e6b78" };
const SERIFA = "Georgia, 'Times New Roman', Times, serif";
const SANS = "Arial, Helvetica, sans-serif";

export function montarEmail(e: ConteudoEmail): { html: string; texto: string } {
  const botao = e.botao ? { texto: e.botao.texto, url: urlSegura(e.botao.url) } : null;
  const area = urlSegura(e.marca.url);
  const logo = e.marca.logoUrl ? urlSegura(e.marca.logoUrl) : null;
  const host = new URL(area).host;
  const { fundo, tinta } = coresDoBotao(e.marca.cor);
  const nome = primeiroNome(e.nome);
  const saudacao = nome ? `Olá, ${nome},` : "Olá,";
  const x = escaparHtml;

  const p = (t: string, estilo = "") =>
    `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:26px;color:${C.corpo};${estilo}">${x(t)}</p>`;
  const marcaTopo = logo
    ? `<img src="${x(logo)}" alt="${x(e.marca.nome)}" height="32" style="display:block;height:32px;width:auto;border:0;outline:none;text-decoration:none">`
    : `<span style="font-family:${SERIFA};font-size:15px;line-height:20px;letter-spacing:3px;text-transform:uppercase;color:${C.texto}">${x(e.marca.nome)}</span>`;
  const blocoBotao = botao
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0"><tr>
<td align="center" bgcolor="${fundo}" style="border-radius:6px;background-color:${fundo};mso-padding-alt:14px 28px">
<a href="${x(botao.url)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:16px;line-height:20px;font-weight:bold;color:${tinta};text-decoration:none;border-radius:6px">${x(botao.texto)}</a>
</td></tr></table>
${e.observacao ? p(e.observacao, `font-size:14px;line-height:22px;color:${C.suave};margin:12px 0 0`) : ""}
<p style="margin:28px 0 0;font-family:${SANS};font-size:13px;line-height:20px;color:${C.suave}">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
<p style="margin:4px 0 0;font-family:${SANS};font-size:13px;line-height:20px;word-break:break-all"><a href="${x(botao.url)}" target="_blank" rel="noopener" style="color:${C.texto};text-decoration:underline">${x(botao.url)}</a></p>`
    : e.observacao
      ? p(e.observacao, `font-size:14px;line-height:22px;color:${C.suave}`)
      : "";

  const html = `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${x(e.titulo)}</title>
<style>@media (max-width:480px){.externo{padding:24px 12px!important}.cartao{padding:32px 22px!important}}</style>
</head>
<body style="margin:0;padding:0;background-color:${C.fundo};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.fundo}">${x(e.previa)}${"&nbsp;&zwnj;".repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.fundo}" style="background-color:${C.fundo}">
<tr><td class="externo" align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td style="padding:0 4px 24px">${marcaTopo}</td></tr>
<tr><td class="cartao" bgcolor="${C.cartao}" style="background-color:${C.cartao};border:1px solid ${C.borda};border-radius:8px;padding:40px 36px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${fundo}" style="width:40px;height:2px;line-height:2px;font-size:2px;background-color:${fundo}">&nbsp;</td></tr></table>
<h1 style="margin:24px 0 24px;font-family:${SERIFA};font-size:28px;line-height:36px;font-weight:normal;color:${C.texto}">${x(e.titulo)}</h1>
${p(saudacao)}
${e.paragrafos.map((t) => p(t)).join("\n")}
${blocoBotao}
</td></tr>
<tr><td style="padding:24px 4px 0">
<p style="margin:0 0 8px;font-family:${SANS};font-size:12px;line-height:19px;color:${C.suave}">${x(e.motivo)}</p>
<p style="margin:0;font-family:${SANS};font-size:12px;line-height:19px;color:${C.suave}">${x(e.marca.nome)} · <a href="${x(area)}" target="_blank" rel="noopener" style="color:${C.suave};text-decoration:underline">${x(host)}</a> · Mensagem automática, não responda.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const texto = [
    e.marca.nome.toUpperCase(),
    e.titulo,
    saudacao,
    ...e.paragrafos,
    ...(botao ? [`${botao.texto}:\n${botao.url}`] : []),
    ...(e.observacao ? [e.observacao] : []),
    `--\n${e.motivo}\n${e.marca.nome} · ${host} · Mensagem automática, não responda.`,
  ].join("\n\n");

  return { html, texto };
}
