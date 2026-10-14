import { ErroDeNegocio } from "@/lib/acao";
import type { FinalidadeArquivo, TipoMaterial } from "@/lib/db/schema/_enums";

/**
 * Regras PURAS do armazenamento (servidor e tela usam as mesmas): allowlist por finalidade
 * (MIME + extensao + tamanho) e montagem da chave do objeto, SEMPRE prefixada pelo criador.
 * A tela valida antes para o erro aparecer cedo; a action valida de novo (fronteira).
 */

const MB = 1024 * 1024;

export interface TipoAceito {
  mime: string;
  extensoes: readonly string[];
  /** Tipo do material quando o arquivo vira anexo de aula. */
  material?: Exclude<TipoMaterial, "LINK">;
}

interface Regra {
  maxBytes: number;
  tipos: readonly TipoAceito[];
  /** Texto de ajuda da tela ("JPG, PNG ou WebP até 10 MB"). */
  descricao: string;
  /** Pasta da chave: criadores/<criador>/<pasta>/<arquivoId>.<ext>. */
  pasta: string;
}

/** SVG fica de fora de proposito: pode carregar script. */
export const ALLOWLIST: Record<FinalidadeArquivo, Regra> = {
  IMAGEM: {
    maxBytes: 10 * MB,
    descricao: "JPG, PNG ou WebP até 10 MB",
    pasta: "imagens",
    tipos: [
      { mime: "image/jpeg", extensoes: ["jpg", "jpeg"] },
      { mime: "image/png", extensoes: ["png"] },
      { mime: "image/webp", extensoes: ["webp"] },
    ],
  },
  MATERIAL: {
    maxBytes: 50 * MB,
    descricao: "PDF, DOC ou DOCX até 50 MB",
    pasta: "materiais",
    tipos: [
      { mime: "application/pdf", extensoes: ["pdf"], material: "PDF" },
      { mime: "application/msword", extensoes: ["doc"], material: "DOC" },
      { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extensoes: ["docx"], material: "DOC" },
    ],
  },
  // Arquivo BRUTO da legenda (RN-180): só passa pelo servidor para virar o .vtt normalizado de
  // `produtos_modulos_aulas_legendas` e é descartado em seguida (ADR-0013). A tela manda o MIME
  // da extensão (o `type` do navegador para .srt varia).
  LEGENDA: {
    maxBytes: 2 * MB,
    descricao: "VTT ou SRT até 2 MB",
    pasta: "legendas-envios",
    tipos: [
      { mime: "text/vtt", extensoes: ["vtt"] },
      { mime: "application/x-subrip", extensoes: ["srt"] },
    ],
  },
  // Comunidade (passo 8, RN-131): limites menores, qualquer membro envia.
  COMUNIDADE_IMAGEM: {
    maxBytes: 5 * MB,
    descricao: "JPG, PNG ou WebP até 5 MB",
    pasta: "comunidade",
    tipos: [
      { mime: "image/jpeg", extensoes: ["jpg", "jpeg"] },
      { mime: "image/png", extensoes: ["png"] },
      { mime: "image/webp", extensoes: ["webp"] },
    ],
  },
  COMUNIDADE_PDF: {
    maxBytes: 20 * MB,
    descricao: "PDF até 20 MB",
    pasta: "comunidade",
    tipos: [{ mime: "application/pdf", extensoes: ["pdf"] }],
  },
};

/** Extensao em minusculas, sem o ponto ("" se nao houver). */
export function extensaoDe(nome: string): string {
  const m = /\.([a-z0-9]{1,10})$/i.exec(nome.trim());
  return m ? m[1].toLowerCase() : "";
}

/** MIME pela extensao (o navegador as vezes manda `type` vazio). `null` = fora da allowlist. */
export function mimeDaExtensao(finalidade: FinalidadeArquivo, nome: string): string | null {
  const ext = extensaoDe(nome);
  return ALLOWLIST[finalidade].tipos.find((t) => t.extensoes.includes(ext))?.mime ?? null;
}

/** `accept` do <input type="file">. */
export function atributoAccept(finalidade: FinalidadeArquivo): string {
  return ALLOWLIST[finalidade].tipos.flatMap((t) => [t.mime, ...t.extensoes.map((e) => `.${e}`)]).join(",");
}

export const formatarTamanho = (bytes: number) =>
  bytes >= MB ? `${(bytes / MB).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Confere MIME, extensao (e os dois juntos) e tamanho contra a allowlist da finalidade.
 * Devolve o tipo aceito; fora da regra lanca `ErroDeNegocio` com a mensagem da tela.
 */
export function validarEnvio(finalidade: FinalidadeArquivo, a: { nome: string; mime: string; tamanho: number }): TipoAceito & { extensao: string } {
  const regra = ALLOWLIST[finalidade];
  const extensao = extensaoDe(a.nome);
  const tipo = regra.tipos.find((t) => t.mime === a.mime.toLowerCase() && t.extensoes.includes(extensao));
  if (!tipo) throw new ErroDeNegocio(`Tipo de arquivo não aceito. Envie ${regra.descricao}.`);
  if (!Number.isInteger(a.tamanho) || a.tamanho <= 0) throw new ErroDeNegocio("Arquivo vazio.");
  if (a.tamanho > regra.maxBytes) throw new ErroDeNegocio(`Arquivo grande demais (${formatarTamanho(a.tamanho)}). Envie ${regra.descricao}.`);
  return { ...tipo, extensao };
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Segmento de chave: so [a-z0-9._-], sem "." ou ".." soltos (nada de subir pasta). */
const RE_SEGMENTO = /^(?!\.{1,2}$)[a-z0-9._-]{1,120}$/i;

/**
 * Chave de objeto do criador: `criadores/<criadorId>/<segmentos...>`. TODA chave nasce aqui;
 * segmento fora do formato lanca (bug de quem chamou, nunca entrada do usuario).
 */
export function chaveDoCriador(criadorId: string, ...segmentos: string[]): string {
  if (!RE_UUID.test(criadorId)) throw new Error("criadorId invalido na chave de objeto");
  if (segmentos.length === 0 || !segmentos.every((s) => RE_SEGMENTO.test(s))) throw new Error("segmento invalido na chave de objeto");
  return ["criadores", criadorId.toLowerCase(), ...segmentos].join("/");
}

/** A chave e DESTE criador? Toda funcao do storage confere antes de assinar/apagar. */
export function chavePertenceAoCriador(chave: string, criadorId: string): boolean {
  const prefixo = `criadores/${criadorId.toLowerCase()}/`;
  if (!RE_UUID.test(criadorId) || !chave.startsWith(prefixo)) return false;
  return chave.slice(prefixo.length).split("/").every((s) => RE_SEGMENTO.test(s));
}

/** Chave do arquivo do catalogo: criadores/<criador>/<imagens|materiais>/<arquivoId>.<ext>. */
export function chaveDeArquivo(criadorId: string, finalidade: FinalidadeArquivo, arquivoId: string, extensao: string): string {
  return chaveDoCriador(criadorId, ALLOWLIST[finalidade].pasta, `${arquivoId}.${extensao}`);
}
