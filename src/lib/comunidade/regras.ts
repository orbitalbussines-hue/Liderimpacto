import { atributoAccept } from "@/lib/armazenamento/regras";
import type { FinalidadeArquivo } from "@/lib/db/schema/_enums";

/**
 * Regras PURAS da comunidade (servidor e tela usam as mesmas). RN-130 a RN-133, ADR-0009.
 *
 * TEXTO PURO: post e comentário guardam texto, nunca HTML. A tela renderiza com o escape do
 * React e NUNCA usa `dangerouslySetInnerHTML`; links viram `<a>` pela lista de `segmentosDeTexto`.
 */

export const TEXTO_POST_MAX = 5000;
export const TEXTO_COMENTARIO_MAX = 2000;
export const MOTIVO_MAX = 500;

/** Anexos por post (RN-131). */
export const MAX_IMAGENS_POST = 4;
export const MAX_PDFS_POST = 2;
export const FINALIDADE_IMAGEM: FinalidadeArquivo = "COMUNIDADE_IMAGEM";
export const FINALIDADE_PDF: FinalidadeArquivo = "COMUNIDADE_PDF";

/** `accept` do `<input type="file">` do compositor (imagens + PDF). */
export const ACCEPT_ANEXOS = `${atributoAccept("COMUNIDADE_IMAGEM")},${atributoAccept("COMUNIDADE_PDF")}`;

/** Enquete (RN-131). */
export const ENQUETE_OPCOES_MIN = 2;
export const ENQUETE_OPCOES_MAX = 6;

/** Limite de frequência (RN-133): janela deslizante, contada no banco. */
export const JANELA_LIMITE_MIN = 10;
export const LIMITE_POSTS_JANELA = 5;
export const LIMITE_COMENTARIOS_JANELA = 20;
export const LIMITE_ENVIOS_JANELA = 12;
export const MSG_LIMITE = "Você publicou muitas vezes em pouco tempo. Aguarde alguns minutos e tente de novo.";

/** Silenciar: de 1 a 365 dias. */
export const SILENCIO_DIAS_MAX = 365;

/** Membros ativos da lateral: posts + comentários nos últimos N dias. */
export const DIAS_MEMBROS_ATIVOS = 30;

/** Canal "Geral" criado por padrão (mesmo texto da migração 0007). */
export const CANAL_GERAL = { nome: "Geral", descricao: "Conversas gerais da comunidade" } as const;

/**
 * Remove o que não é texto visível e pode enganar quem lê: controles C0/C1 (menos quebra de linha
 * e tab), marcas de direção (bidi override, usado para disfarçar link) e caracteres de largura
 * zero. Normaliza quebras para `\n`. Não mexe em `<`, `>` ou `&`: o escape é da renderização.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, "")
    .trim();
}

export type SegmentoDeTexto = { tipo: "texto"; valor: string } | { tipo: "link"; valor: string; href: string };

const RE_LINK = /https?:\/\/[^\s<>"']+/gi;
/** Pontuação colada no fim do link ("veja https://x.com.") fica fora dele. */
const RE_CAUDA = /[.,;:!?)\]}'"]+$/;

/**
 * Separa texto e links http(s) para a tela renderizar: texto como texto (escapado pelo React) e
 * link como `<a href={href} rel="noopener noreferrer nofollow" target="_blank">{valor}</a>`.
 * Só http/https com host válido vira link; qualquer outra coisa (javascript:, data:) é texto.
 */
export function segmentosDeTexto(texto: string): SegmentoDeTexto[] {
  const saida: SegmentoDeTexto[] = [];
  const empurrarTexto = (valor: string) => {
    if (!valor) return;
    const ultimo = saida.at(-1);
    if (ultimo?.tipo === "texto") ultimo.valor += valor;
    else saida.push({ tipo: "texto", valor });
  };
  let inicio = 0;
  for (const m of texto.matchAll(RE_LINK)) {
    const bruto = m[0];
    const cauda = RE_CAUDA.exec(bruto)?.[0] ?? "";
    const valor = bruto.slice(0, bruto.length - cauda.length);
    empurrarTexto(texto.slice(inicio, m.index));
    const href = linkSeguro(valor);
    if (href) saida.push({ tipo: "link", valor, href });
    else empurrarTexto(valor);
    empurrarTexto(cauda);
    inicio = m.index + bruto.length;
  }
  empurrarTexto(texto.slice(inicio));
  return saida;
}

function linkSeguro(valor: string): string | null {
  try {
    const u = new URL(valor);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname.includes(".") || u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** "Ana Paula Pacheco" -> "AP" (avatar sem foto). */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? (partes.at(-1)?.[0] ?? "") : (partes[0][1] ?? "");
  return (primeira + ultima).toUpperCase();
}

/** Primeiro nome (o que a notificação mostra: "Ana curtiu..."). */
export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || "Alguém";

/** Resumo de uma linha (fixados, fila de denúncias). */
export function resumo(texto: string, max = 80): string {
  const uma = texto.replace(/\s+/g, " ").trim();
  return uma.length > max ? `${uma.slice(0, max - 1).trimEnd()}…` : uma;
}

/** Conta imagens e PDFs e confere os limites do post. `null` = ok; senão a mensagem. */
export function problemaDosAnexos(finalidades: readonly FinalidadeArquivo[]): string | null {
  const imagens = finalidades.filter((f) => f === FINALIDADE_IMAGEM).length;
  const pdfs = finalidades.filter((f) => f === FINALIDADE_PDF).length;
  if (imagens + pdfs !== finalidades.length) return "Anexo inválido. Envie imagens (JPG, PNG, WebP) ou PDF.";
  if (imagens > MAX_IMAGENS_POST) return `No máximo ${MAX_IMAGENS_POST} imagens por publicação.`;
  if (pdfs > MAX_PDFS_POST) return `No máximo ${MAX_PDFS_POST} PDFs por publicação.`;
  return null;
}

/** Finalidade do anexo pelo tipo declarado (imagem ou PDF). `null` = fora da comunidade. */
export function finalidadeDoAnexo(mime: string): FinalidadeArquivo | null {
  const m = mime.trim().toLowerCase();
  if (m === "application/pdf") return FINALIDADE_PDF;
  if (m.startsWith("image/")) return FINALIDADE_IMAGEM;
  return null;
}

/** Enquete aberta para voto no instante `agora`. */
export const enqueteAberta = (encerraEm: Date | null, agora: Date) => encerraEm === null || encerraEm.getTime() > agora.getTime();

// ---------------------------------------------------------------- cursor do feed (opaco)

export type OrdemFeed = "RECENTES" | "CURTIDOS";
export interface CursorFeed {
  curtidas: number;
  criadoEm: Date;
  id: string;
}

export function codificarCursor(c: CursorFeed): string {
  return Buffer.from(JSON.stringify([c.curtidas, c.criadoEm.toISOString(), c.id])).toString("base64url");
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cursor vindo da URL: inválido = `null` (a tela volta ao começo, sem erro). */
export function decodificarCursor(texto: string | null | undefined): CursorFeed | null {
  if (!texto || texto.length > 200) return null;
  try {
    const v: unknown = JSON.parse(Buffer.from(texto, "base64url").toString("utf8"));
    if (!Array.isArray(v) || v.length !== 3) return null;
    const [curtidas, criadoEm, id] = v as [unknown, unknown, unknown];
    const data = typeof criadoEm === "string" ? new Date(criadoEm) : null;
    if (!Number.isInteger(curtidas) || (curtidas as number) < 0 || !data || Number.isNaN(data.getTime()) || typeof id !== "string" || !RE_UUID.test(id)) return null;
    return { curtidas: curtidas as number, criadoEm: data, id };
  } catch {
    return null;
  }
}
