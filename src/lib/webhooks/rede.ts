import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { TIMEOUT_WEBHOOK_MS } from "./regras";

/**
 * Saída HTTP dos webhooks com bloqueio de SSRF (ADR-0018 item 5): só https, o host é RESOLVIDO e
 * TODOS os endereços precisam ser públicos (loopback, privado, link-local/metadados, CGNAT,
 * multicast, documentação, NAT64/6to4 e IPv4 mapeado = recusa). A conexão usa o MESMO endereço
 * conferido (o `lookup` da requisição é o nosso): DNS que muda entre conferir e conectar não passa.
 * Timeout curto, redirecionamento não é seguido, corpo da resposta descartado.
 */

const bloqueados = new BlockList();
for (const [rede, prefixo] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) bloqueados.addSubnet(rede, prefixo, "ipv4");
for (const [rede, prefixo] of [
  // `::ffff:0:0/96` NÃO entra: o BlockList compara IPv4 como mapeado e bloquearia toda a internet;
  // o IPv6 mapeado (`::ffff:10.0.0.1`) já cai nas regras de IPv4 acima.
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001:db8::", 32],
  ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) bloqueados.addSubnet(rede, prefixo, "ipv6");

/** Endereço que um webhook nunca pode alcançar (também o que não é IP). */
export function ipBloqueado(ip: string): boolean {
  const v = isIP(ip);
  if (v === 0) return true;
  return bloqueados.check(ip, v === 4 ? "ipv4" : "ipv6");
}

export class DestinoBloqueado extends Error {
  constructor(host: string) {
    super(`Destino não permitido (${host} resolve para endereço interno).`);
    this.name = "DestinoBloqueado";
  }
}

/** Resolve e confere TODOS os endereços. Lança `DestinoBloqueado` se algum for interno. */
export async function resolverPublico(host: string): Promise<{ address: string; family: number }[]> {
  const nome = host.replace(/^\[|\]$/g, "");
  if (isIP(nome)) {
    if (ipBloqueado(nome)) throw new DestinoBloqueado(nome);
    return [{ address: nome, family: isIP(nome) }];
  }
  const enderecos = await lookup(nome, { all: true, verbatim: true });
  if (!enderecos.length || enderecos.some((e) => ipBloqueado(e.address))) throw new DestinoBloqueado(nome);
  return enderecos;
}

/** `lookup` da requisição: o Node conecta só no que passou por `resolverPublico`. */
const lookupSeguro: LookupFunction = (host, opcoes, cb) => {
  resolverPublico(host).then(
    (lista) => (opcoes.all ? cb(null, lista) : cb(null, lista[0].address, lista[0].family)),
    (e: NodeJS.ErrnoException) => cb(e, "", 0),
  );
};

export interface RespostaWebhook {
  status: number;
}

export type PostarWebhook = (url: string, corpo: string, cabecalhos: Record<string, string>) => Promise<RespostaWebhook>;

/** POST real. Lança em erro de rede/timeout/bloqueio; status não-2xx volta normalmente. */
export const postarWebhook: PostarWebhook = async (texto, corpo, cabecalhos) => {
  const url = new URL(texto);
  if (url.protocol !== "https:") throw new Error("Só https.");
  // IP literal não passa pelo `lookup`: confere aqui.
  await resolverPublico(url.hostname);
  return new Promise<RespostaWebhook>((resolver, rejeitar) => {
    const req = request(
      url,
      {
        method: "POST",
        lookup: lookupSeguro,
        timeout: TIMEOUT_WEBHOOK_MS,
        headers: { ...cabecalhos, "content-type": "application/json", "content-length": Buffer.byteLength(corpo), "user-agent": "LiderDeImpacto-Webhooks/1" },
      },
      (res) => {
        res.resume(); // descarta o corpo
        resolver({ status: res.statusCode ?? 0 });
        res.destroy();
      },
    );
    // Teto TOTAL (o `timeout` do Node é por inatividade do socket).
    const teto = setTimeout(() => req.destroy(new Error(`Sem resposta em ${TIMEOUT_WEBHOOK_MS / 1000} s.`)), TIMEOUT_WEBHOOK_MS);
    req.on("timeout", () => req.destroy(new Error(`Sem resposta em ${TIMEOUT_WEBHOOK_MS / 1000} s.`)));
    req.on("error", rejeitar);
    req.on("close", () => clearTimeout(teto));
    req.end(corpo);
  });
};
