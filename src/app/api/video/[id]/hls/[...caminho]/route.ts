import type { NextRequest } from "next/server";
import { servirHls } from "@/lib/video/entrega";

/** Playlist (reescrita com o token) ou segmento (302 para URL assinada curta). ADR-0005. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; caminho: string[] }> }) {
  const { id, caminho } = await ctx.params;
  return servirHls(req.headers, req.nextUrl.searchParams.get("t"), id, caminho);
}
