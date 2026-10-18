import "server-only";
import { z } from "zod";
import { chaveDeIp, ipDoCliente } from "@/lib/auth/ip";
import { estourouTeto } from "@/lib/auth/teto";
import { alvoDosCabecalhos } from "@/lib/criador/area";
import { registrarVisita } from "./publico";

/**
 * `POST /api/paginas/visita` (beacon da página pública, RN-246): +1 visita do dia na página/funil. Sem
 * cookie e sem guardar IP (o IP só vira chave do teto: 60 por 10 min, para um robô não inflar a métrica).
 * Sempre 204 (o navegador não espera nada); página de outro criador ou fora do ar não conta.
 */
export const TETO_VISITAS_POR_IP = 60;
const corpoSchema = z.strictObject({ p: z.uuid(), f: z.uuid().nullable() });

export async function atenderVisita(req: Request): Promise<Response> {
  const vazio = new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  const alvo = await alvoDosCabecalhos(req.headers);
  if (alvo?.tipo !== "criador") return vazio;
  let corpo: unknown;
  try {
    corpo = JSON.parse((await req.text()).slice(0, 500));
  } catch {
    return vazio;
  }
  const e = corpoSchema.safeParse(corpo);
  if (!e.success) return vazio;
  if (await estourouTeto(`visita-ip:${chaveDeIp(ipDoCliente(req.headers))}`, 600, TETO_VISITAS_POR_IP)) return vazio;
  await registrarVisita(alvo.criador.id, e.data.p, e.data.f);
  return vazio;
}
