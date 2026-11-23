import "server-only";
import { z } from "zod";
import { ipDoCliente } from "@/lib/auth/ip";
import { alvoDosCabecalhos } from "@/lib/criador/area";
import { emailPessoa, nomePessoa } from "@/lib/validators/membros";
import { RE_SLUG_PAGINA } from "./config";
import { MSG_FORMULARIO_INDISPONIVEL, capturarLead } from "./leads";
import { paginaPublicada } from "./publico";

/**
 * `POST /api/paginas/inscricao/<slug>` — inscrição vinda de um SITE EXTERNO (ex.: site da palestra), RN-283.
 * Vira lead da página PUBLICADA `<slug>` do criador do HOST: consentimento e tag saem do bloco FORMULARIO
 * dela (nunca do corpo), com honeypot e teto por IP do `capturarLead`. Guarda WhatsApp, perfil e se aceitou
 * novidades (quem não aceitou fica fora das campanhas).
 * Contrato do site: corpo JSON em `text/plain` (sem preflight), resposta `{ ok: true }` ou `{ ok: false, erro }`
 * com 200 (o site mostra o `erro`). CORS `*`: não há cookie nem dado devolvido.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};
const responder = (corpo: { ok: boolean; erro?: string }, status = 200) => Response.json(corpo, { status, headers: CORS });
export const atenderPreflight = () => new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "86400" } });

/** Campos extras do site (origem, enviado_em) são ignorados. */
export const inscricaoSchema = z.object({
  nome: nomePessoa,
  email: emailPessoa,
  whatsapp: z
    .string()
    .max(30)
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().regex(/^[1-9]\d{9,10}$/, "Informe o WhatsApp com DDD.")),
  perfil: z
    .string()
    .trim()
    .max(60, "Perfil inválido.")
    .regex(/^[^<>]*$/, "Perfil inválido.")
    .optional()
    .transform((v) => v || null),
  marketing: z.boolean().optional().default(false),
  site: z.string().max(200).optional().default(""),
});

export async function atenderInscricao(req: Request, slug: string): Promise<Response> {
  const alvo = await alvoDosCabecalhos(req.headers);
  if (alvo?.tipo !== "criador" || !RE_SLUG_PAGINA.test(slug)) return responder({ ok: false, erro: MSG_FORMULARIO_INDISPONIVEL }, 404);
  let corpo: unknown;
  try {
    const texto = await req.text();
    if (texto.length > 4000) throw new Error("grande");
    corpo = JSON.parse(texto);
  } catch {
    return responder({ ok: false, erro: "Confira os dados." }, 400);
  }
  const e = inscricaoSchema.safeParse(corpo);
  if (!e.success) return responder({ ok: false, erro: e.error.issues[0]?.message ?? "Confira os dados." });
  try {
    const pagina = await paginaPublicada(alvo.criador.id, slug);
    if (!pagina) return responder({ ok: false, erro: MSG_FORMULARIO_INDISPONIVEL });
    const d = e.data;
    const r = await capturarLead(
      alvo.criador,
      slug,
      { pagina: pagina.id, funil: null, nome: d.nome, email: d.email, consentimento: "sim", site: d.site, utm: {}, cupom: "", afiliado: "" },
      ipDoCliente(req.headers),
      new Date(),
      { telefone: d.whatsapp, perfil: d.perfil, aceitaNovidades: d.marketing },
    );
    return r.ok ? responder({ ok: true }) : responder({ ok: false, erro: r.erro });
  } catch (erro) {
    console.error("[paginas] inscrição externa falhou:", erro instanceof Error ? erro.message : erro);
    return responder({ ok: false, erro: "Não foi possível enviar agora. Tente de novo em instantes." }, 500);
  }
}
