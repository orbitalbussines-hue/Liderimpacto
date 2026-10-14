import "server-only";
import { ZodError } from "zod";
import { papelEfetivo } from "@/lib/auth/permissoes";
import { sessaoDosCabecalhos } from "@/lib/auth/sessao";
import { receberBatida } from "./batida";
import { TAMANHO_MAXIMO_CORPO } from "./regras";

/**
 * `POST /api/progresso` (navigator.sendBeacon do player). Sem Next aqui: recebe a `Request` e
 * devolve `Response` (o route handler só repassa; o teste chama direto). Contrato em docs/back.md.
 *
 * - Sessão PLENA do HOST (cookie de outro host/criador não vale: ADR-0003) + vínculo no criador.
 * - Origin, quando vem, tem de ser o próprio host (beacon de outro site não registra).
 * - Corpo JSON até 4 KB (o beacon manda `text/plain` ou `application/json`; os dois servem).
 * - 204 = registrada OU ignorada (limite de frequência, teto de segundos, aula sem duração).
 * - Recusa NÃO vai para a trilha: o player repete a cada 10 s e encheria a trilha (igual à playlist).
 */

const SEM_CACHE = { "Cache-Control": "no-store" };
const resposta = (status: number) => new Response(null, { status, headers: SEM_CACHE });

/** Lê o corpo parando no limite (não confia no Content-Length). `null` = grande demais. */
async function corpoLimitado(req: Request): Promise<string | null> {
  if (Number(req.headers.get("content-length") ?? 0) > TAMANHO_MAXIMO_CORPO) return null;
  if (!req.body) return "";
  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > TAMANHO_MAXIMO_CORPO) {
      await leitor.cancel();
      return null;
    }
    partes.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(partes));
}

function origemDeOutroSite(h: Headers): boolean {
  const origem = h.get("origin");
  if (!origem) return false;
  try {
    return new URL(origem).host !== h.get("host");
  } catch {
    return true;
  }
}

export async function atenderBeacon(req: Request): Promise<Response> {
  if (origemDeOutroSite(req.headers)) return resposta(403);
  const texto = await corpoLimitado(req);
  if (texto === null) return resposta(413);
  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return resposta(400);
  }
  const s = await sessaoDosCabecalhos(req.headers);
  if (!s || s.provisoria || s.alvo.tipo !== "criador") return resposta(401);
  try {
    const r = await receberBatida(
      { criadorId: s.alvo.criador.id, membroId: s.acesso.membro?.id ?? null, usuarioId: s.userId, papel: papelEfetivo(s.acesso), sessaoId: s.sessaoId },
      corpo,
    );
    if (r.situacao === "recusada") return resposta(r.motivo === "nao-encontrada" ? 404 : 403);
    return resposta(204);
  } catch (e) {
    if (e instanceof ZodError) return resposta(400);
    throw e;
  }
}
