import type { NextRequest } from "next/server";
import { situacaoParaEquipe } from "@/lib/video/entrega";

/** Situação do processamento para o editor da aula (polling leve, só a equipe do host). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return situacaoParaEquipe(req.headers, id);
}
