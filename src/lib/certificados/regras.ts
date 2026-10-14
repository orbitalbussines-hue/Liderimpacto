import { urlDaArea } from "@/lib/criador/host";
import { gerarPaleta, PALETA_PADRAO } from "@/lib/marca/paleta";

/**
 * Regras PURAS dos certificados (RN-127 a RN-129), testadas em regras.test.ts: código de
 * verificação, texto do modelo, carga horária, data por extenso, URL pública e cor.
 */

/** Base32 sem os ambíguos (0/O, 1/I): 32 símbolos, 10 caracteres = 50 bits, não sequencial. */
export const ALFABETO_CODIGO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const TAMANHO_CODIGO = 10;
export const RE_CODIGO = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/;

/** Web Crypto (Node e navegador). 256 é múltiplo de 32: `byte & 31` não enviesa. */
export function gerarCodigo(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(TAMANHO_CODIGO));
  return Array.from(bytes, (b) => ALFABETO_CODIGO[b & 31]).join("");
}

/** O que a pessoa digitou ("k7m2-x9qp 4h") -> "K7M2X9QP4H"; `null` se não for um código. */
export function normalizarCodigo(digitado: string): string | null {
  const c = digitado.toUpperCase().replace(/[\s-]/g, "");
  return RE_CODIGO.test(c) ? c : null;
}

/** "K7M2X-9QP4H" (leitura humana; a URL usa o código sem hífen). */
export const codigoLegivel = (c: string) => `${c.slice(0, 5)}-${c.slice(5)}`;

/** Modelo padrão (sem linha no banco): RN-127, padrão aguardando o cliente. */
export const MODELO_PADRAO = {
  titulo: "Certificado de conclusão",
  texto: "Certificamos que {nome} concluiu o curso {curso}, com carga horária de {carga_horaria}, em {data}.",
  assinaturaCargo: "Responsável",
} as const;

export interface VariaveisTexto {
  nome: string;
  curso: string;
  carga_horaria: string;
  data: string;
}

/** Troca {nome}, {curso}, {carga_horaria} e {data}; chave desconhecida fica como está. */
export function preencherTexto(modelo: string, v: VariaveisTexto): string {
  return modelo.replace(/\{(nome|curso|carga_horaria|data)\}/g, (_, k: keyof VariaveisTexto) => v[k]);
}

/** Soma das durações arredondada à hora cheia, mínimo 1 h: "1 hora", "8 horas". */
export function cargaHorariaTexto(segundos: number): string {
  const h = Math.max(1, Math.round(segundos / 3600));
  return `${h} ${h === 1 ? "hora" : "horas"}`;
}

const POR_EXTENSO = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

/** "14 de outubro de 2026" (calendário de Brasília). */
export const dataPorExtenso = (d: Date) => POR_EXTENSO.format(d);

/**
 * URL pública de verificação (QR do PDF): origem da área do criador + /certificado/<codigo>.
 * `urlPlataforma` = `urlDaPlataforma()` — produção https://liderdeimpacto.com.br vira
 * https://<slug>.liderdeimpacto.com.br; dev http://localhost:3011 vira http://<slug>.localhost:3011.
 */
export const urlDeVerificacao = (urlPlataforma: string, slugCriador: string, codigo: string) =>
  `${urlDaArea(urlPlataforma, slugCriador)}/certificado/${codigo}`;

/**
 * Cor do certificado: modelo → curso → criador → dourado da plataforma, já ajustada para ser
 * legível sobre o papel claro (mesma régua de contraste da marca, tema claro).
 */
export function corDoCertificado(...candidatas: (string | null | undefined)[]): string {
  const base = candidatas.find((c): c is string => !!c) ?? PALETA_PADRAO;
  return gerarPaleta(base).light["--accent"];
}

/** Nome do arquivo baixado. */
export const nomeDoPdf = (codigo: string, versao: number) => `certificado-${codigo}-v${versao}.pdf`;
