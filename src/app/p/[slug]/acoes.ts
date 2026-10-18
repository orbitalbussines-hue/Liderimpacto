"use server";

import { headers } from "next/headers";
import { ipDoCliente } from "@/lib/auth/ip";
import { alvoAtual } from "@/lib/criador/atual";
import { RE_SLUG_PAGINA } from "@/lib/paginas/config";
import { capturarLead } from "@/lib/paginas/leads";
import { consultaDaVisita, lerParametros } from "@/lib/paginas/visita";
import { capturaSchema } from "@/lib/validators/paginas";

export type EstadoCaptura = { ok: true; proxima: string | null } | { ok: false; erro: string } | null;

const texto = (d: FormData, k: string) => {
  const v = d.get(k);
  return typeof v === "string" ? v : "";
};

/**
 * Formulário de captura da página PUBLICADA (RN-243), público e sem login. O criador vem do HOST; a
 * página, do slug + id conferidos no servidor; consentimento e tag, da versão publicada. Honeypot, teto
 * por IP e validação no `capturarLead`. Em funil, devolve a próxima etapa (com cupom/afiliado/UTM).
 */
export async function enviarCaptura(_: EstadoCaptura, dados: FormData): Promise<EstadoCaptura> {
  const alvo = await alvoAtual();
  const slug = texto(dados, "slug");
  if (alvo?.tipo !== "criador" || !RE_SLUG_PAGINA.test(slug)) return { ok: false, erro: "Este formulário não está mais disponível." };
  const repasse = lerParametros((k) => texto(dados, k));
  const e = capturaSchema.safeParse({
    pagina: texto(dados, "pagina"),
    funil: repasse.funil,
    nome: texto(dados, "nome"),
    email: texto(dados, "email"),
    consentimento: texto(dados, "consentimento"),
    site: texto(dados, "site"),
    utm: repasse.utm,
    cupom: repasse.cupom ?? "",
    afiliado: repasse.afiliado ?? "",
  });
  if (!e.success) return { ok: false, erro: e.error.issues[0]?.message ?? "Confira os dados." };
  try {
    const r = await capturarLead(alvo.criador, slug, e.data, ipDoCliente(await headers()));
    if (!r.ok) return r;
    return { ok: true, proxima: r.proximaSlug ? `/p/${r.proximaSlug}${consultaDaVisita({ ...repasse, funil: r.funilId })}` : null };
  } catch (erro) {
    console.error("[paginas] captura falhou:", erro instanceof Error ? erro.message : erro);
    return { ok: false, erro: "Não foi possível enviar agora. Tente de novo em instantes." };
  }
}
