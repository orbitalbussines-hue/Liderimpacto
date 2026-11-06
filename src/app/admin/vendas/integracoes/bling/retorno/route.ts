import { ErroDeNegocio } from "@/lib/acao";
import { exigirMembro, exigirSessao } from "@/lib/auth/autorizacao";
import { concluirAutorizacaoBling } from "@/lib/integracoes/bling/oauth";

/**
 * Retorno do OAuth do Bling (ADR-0024 item 5): `GET <área>/admin/vendas/integracoes/bling/retorno?code=&state=`.
 * Fica na ÁREA do criador (o cookie da sessão é por host). Só DONO, conferido aqui (a borda não é
 * fronteira); o `state` assinado prende o retorno a esta sessão e à conexão. Volta para a tela com
 * `?bling=autorizado` ou `?bling=erro&motivo=<código>` (só código: a tela traduz, então um link
 * forjado não põe texto livre na tela do DONO).
 */
// Location RELATIVO: mesmo host e protocolo do navegador (atrás do nginx, `req.url` é o endereço interno).
const voltar = (q: Record<string, string>) => new Response(null, { status: 303, headers: { Location: `/admin/vendas/integracoes?${new URLSearchParams(q).toString()}` } });

export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = u.searchParams.get("code") ?? "";
  const estado = u.searchParams.get("state") ?? "";
  try {
    const { usuario, criador } = await exigirMembro(["DONO"]);
    const { sessaoId } = await exigirSessao();
    if (u.searchParams.get("error") || !/^[A-Za-z0-9._~-]{1,512}$/.test(code) || estado.length > 400) throw new ErroDeNegocio("O Bling não autorizou. Tente de novo.");
    await concluirAutorizacaoBling({ criadorId: criador.id, usuarioId: usuario.id, sessaoId, code, estado, agora: new Date() });
    return voltar({ bling: "autorizado" });
  } catch (e) {
    if (!(e instanceof ErroDeNegocio)) console.error("[bling] retorno do OAuth falhou:", e instanceof Error ? e.message.slice(0, 120) : "erro");
    const msg = e instanceof ErroDeNegocio ? e.message : "";
    return voltar({ bling: "erro", motivo: msg.startsWith("Autorização vencida") ? "sessao" : msg.startsWith("O Bling não autorizou") ? "negado" : "falha" });
  }
}
