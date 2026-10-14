import { NextResponse, type NextRequest } from "next/server";
import { urlDoPdfPorCodigo } from "@/lib/certificados/consultas";
import { alvoDosCabecalhos } from "@/lib/criador/area";

/**
 * Download PÚBLICO do PDF pelo código (página de verificação, sem sessão): criador do HOST,
 * só certificado não revogado com versão PRONTA. Redireciona para o link assinado de 5 min.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params;
  const alvo = await alvoDosCabecalhos(req.headers);
  const pdf = alvo?.tipo === "criador" && codigo.length <= 40 ? await urlDoPdfPorCodigo(alvo.criador.id, codigo) : null;
  if (!pdf) return new NextResponse("Certificado não encontrado.", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  const r = NextResponse.redirect(pdf.url, 302);
  r.headers.set("Cache-Control", "no-store");
  r.headers.set("X-Robots-Tag", "noindex");
  return r;
}
