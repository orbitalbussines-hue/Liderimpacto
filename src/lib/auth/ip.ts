/**
 * IP do cliente — funcao CANONICA (docs/seguranca-login.md: "IP lido por uma
 * funcao"). Atras do NOSSO proxy reverso (VPS), o `X-Real-IP` e gravado por
 * ele (`proxy_set_header X-Real-IP $remote_addr`), sobrescrevendo o que o
 * cliente mandar; o Better Auth le o mesmo cabecalho (`advanced.ipAddress` em
 * auth.ts). Sem ele, o ULTIMO item do x-forwarded-for (o que o proxy anexou;
 * os anteriores vem do cliente e sao forjaveis).
 * ponytail: se entrar CDN na frente, ler o cabecalho proprio dela aqui, e so aqui.
 */
import { isIP } from "node:net";

export const CABECALHO_IP = "x-real-ip";

/** Aparelho (user-agent) para a trilha, cortado. */
export const agenteDe = (h: Headers | null | undefined) => (h?.get("user-agent") ?? "desconhecido").slice(0, 160);

export function ipDoCliente(h: Headers | null | undefined): string {
  const real = h?.get(CABECALHO_IP)?.trim();
  const ultimoDaCadeia = h?.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean).at(-1);
  const bruto = real || ultimoDaCadeia;
  if (!bruto) return "local";
  // Cabecalho e texto de quem chama: sem forma de IP, vira "invalido" — nunca
  // uma chave de teto inventada nem uma linha de trilha com lixo (REQ-C6).
  return isIP(bruto) ? bruto : "invalido";
}

/**
 * Chave dos TETOS por IP. IPv6 agrupado por /64 — o mesmo que o Better Auth faz
 * no rate limit dele: quem tem um /64 troca de endereco a vontade, e cada
 * endereco novo zeraria o teto. IPv4 (e IPv4 mapeado em IPv6) fica inteiro.
 * A trilha continua com o IP completo (ipDoCliente).
 */
export function chaveDeIp(ip: string): string {
  const v4 = ip.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) return v4[1];
  if (!ip.includes(":")) return ip;
  const [cabeca = "", cauda = ""] = ip.toLowerCase().split("::");
  const inicio = cabeca ? cabeca.split(":") : [];
  const fim = ip.includes("::") && cauda ? cauda.split(":") : [];
  const zeros = ip.includes("::") ? Array<string>(Math.max(0, 8 - inicio.length - fim.length)).fill("0") : [];
  return `${[...inicio, ...zeros, ...fim].slice(0, 4).map((g) => g.padStart(4, "0")).join(":")}::/64`;
}
