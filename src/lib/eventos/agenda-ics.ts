/**
 * Arquivo `.ics` (RFC 5545) do "Adicionar à agenda" — PURO, testado em agenda-ics.test.ts. NUNCA leva
 * o link da sala (RN-142: o link só sai do servidor na janela); leva o endereço da página do evento,
 * que confere o público e mostra o link na hora.
 */

export interface EventoParaAgenda {
  id: string;
  titulo: string;
  descricao: string;
  inicioEm: Date;
  fimEm: Date;
  cancelado: boolean;
  /** Endereço absoluto da página do evento na área (https://<host>/eventos/<id>). */
  url: string;
  /** Host da área: compõe o UID (o mesmo evento atualiza a entrada na agenda em vez de duplicar). */
  host: string;
}

/** Escape de TEXT (RFC 5545 §3.3.11): \ ; , e quebra de linha. */
export const escaparIcs = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** 20261021T223000Z */
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Dobra a linha em 75 octetos (UTF-8), continuação com um espaço (§3.1). Não parte caractere. */
export function dobrarLinha(linha: string): string {
  const partes: string[] = [];
  let atual = "";
  let octetos = 0;
  for (const ch of linha) {
    const n = Buffer.byteLength(ch, "utf8");
    const limite = partes.length === 0 ? 75 : 74; // a continuação já tem 1 octeto (o espaço)
    if (octetos + n > limite) {
      partes.push(atual);
      atual = "";
      octetos = 0;
    }
    atual += ch;
    octetos += n;
  }
  partes.push(atual);
  return partes.join("\r\n ");
}

export function gerarIcs(e: EventoParaAgenda, agora: Date): string {
  const descricao = [e.descricao.trim(), `Página do encontro (o link da sala aparece 15 min antes): ${e.url}`].filter(Boolean).join("\n\n");
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lider de Impacto//Eventos ao vivo//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:evento-${e.id}@${e.host}`,
    `DTSTAMP:${utc(agora)}`,
    `DTSTART:${utc(e.inicioEm)}`,
    `DTEND:${utc(e.fimEm)}`,
    `SUMMARY:${escaparIcs(e.titulo)}`,
    `DESCRIPTION:${escaparIcs(descricao)}`,
    `URL:${e.url}`,
    `STATUS:${e.cancelado ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return linhas.map(dobrarLinha).join("\r\n") + "\r\n";
}

/** Nome do arquivo baixado: "encontro-mentoria-ao-vivo.ics" (só [a-z0-9-]). */
export function nomeDoIcs(titulo: string): string {
  const base = titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `encontro${base ? `-${base}` : ""}.ics`;
}
