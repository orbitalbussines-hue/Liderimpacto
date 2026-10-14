import type { NextRequest } from "next/server";
import { servirChave } from "@/lib/video/entrega";

/** Chave AES-128 do vídeo: sessão + `podeAssistir` + sessão de reprodução viva. `no-store`. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return servirChave(req.headers, req.nextUrl.searchParams.get("t"), id);
}
