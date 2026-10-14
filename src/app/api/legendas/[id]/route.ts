import type { NextRequest } from "next/server";
import { servirLegenda } from "@/lib/legendas/entrega";

/** `.vtt` da legenda (`<track>` do player e aba Transcrição): só quem pode assistir a aula. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return servirLegenda(req.headers, id);
}
