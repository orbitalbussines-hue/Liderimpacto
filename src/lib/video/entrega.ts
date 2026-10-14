import "server-only";
import { and, eq } from "drizzle-orm";
import { lerObjeto, urlDeLeitura } from "@/lib/armazenamento/cliente";
import { chaveDoCriador } from "@/lib/armazenamento/regras";
import { registrarAuditoriaSegura } from "@/lib/audit/registrar";
import { EQUIPE, papelAceito, papelEfetivo } from "@/lib/auth/permissoes";
import { sessaoDosCabecalhos } from "@/lib/auth/sessao";
import { alvoDosCabecalhos } from "@/lib/criador/area";
import { db } from "@/lib/db";
import { produtos_modulos_aulas } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { podeAssistir } from "./acesso";
import { decifrarChave } from "./chaves";
import { reescreverPlaylist } from "./playlist";
import { rotasVideo } from "./provedor-proprio";
import { estadoDoVideo, videoVivo } from "./registro";
import { lerCaminhoHls } from "./regras";
import { sessaoReproducaoViva } from "./reproducao";
import { type DadosToken, verificarToken } from "./token";

/**
 * Entrega protegida do HLS pelo APP (ADR-0005). Sem Next aqui: recebe cabeçalhos e devolve
 * `Response` (os route handlers só repassam; o teste chama direto).
 *
 * - Playlist e chave: conferência COMPLETA (token + sessão de login do host + vídeo do criador
 *   + `podeAssistir` + sessão de reprodução viva). Playlist sai reescrita com o token.
 * - Segmento com token VÁLIDO: só HMAC + host (sem banco) e 302 para URL assinada de 60 s no
 *   storage. O Next nunca carrega bytes de vídeo. Token VENCIDO (Safari nativo não troca o
 *   token da playlist VOD): aceito só com a conferência completa.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEM_CACHE = { "Cache-Control": "private, no-store" };
const VALIDADE_SEGMENTO_SEG = 60;

const nao = (status: 403 | 404) => new Response(null, { status, headers: SEM_CACHE });

/** Criador do host (404 se o host não é área de criador). */
async function criadorDoHost(h: Headers): Promise<string | null> {
  const alvo = await alvoDosCabecalhos(h);
  return alvo?.tipo === "criador" ? alvo.criador.id : null;
}

/**
 * Conferência completa. Devolve o vídeo (com a aula) ou o status de recusa. Recusa da CHAVE vai
 * para a trilha (best-effort); a de playlist não (o player repete e encheria a trilha).
 */
type Recusa = { recusa: 403 | 404; motivo: string; userId: string | null };

async function conferirTudo(h: Headers, criadorId: string, dados: DadosToken) {
  const s = await sessaoDosCabecalhos(h);
  const recusa = (status: 403 | 404, motivo: string): Recusa => ({ recusa: status, motivo, userId: s?.userId ?? null });
  if (!s || s.provisoria || s.userId !== dados.usuarioId) return recusa(403, "sessão de login ausente ou de outra pessoa");
  const v = await videoVivo(criadorId, dados.videoId);
  if (!v || v.situacao !== "PRONTO" || !v.prefixo_hls) return recusa(404, "vídeo inexistente ou não pronto");
  const [aula] = await db
    .select({ liberaEm: produtos_modulos_aulas.libera_em })
    .from(produtos_modulos_aulas)
    .where(and(eq(produtos_modulos_aulas.id, v.aula_id), eq(produtos_modulos_aulas.criador_id, criadorId), vivos(produtos_modulos_aulas)));
  if (!aula || !podeAssistir({ papel: papelEfetivo(s.acesso) }, aula)) return recusa(403, "sem permissão para assistir");
  if (!(await sessaoReproducaoViva({ ...dados, criadorId }))) return recusa(403, "sessão de reprodução encerrada");
  return { video: v };
}

/**
 * Token da query: válido, ou vencido-mas-autêntico (`vencido: true`). Recusa: 404 se o token é
 * de OUTRO criador (vídeo de A no host de B não "existe" aqui), 403 no resto.
 */
function lerToken(t: string | null, videoId: string, criadorId: string): { dados: DadosToken; vencido: boolean } | { recusa: 403 | 404 } {
  if (!t) return { recusa: 403 };
  const r = verificarToken(t, { videoId, criadorId });
  if (r.ok) return { dados: r.dados, vencido: false };
  if (r.motivo === "expirado") return { dados: r.dados, vencido: true };
  return { recusa: r.motivo === "outro-criador" ? 404 : 403 };
}

export async function servirHls(h: Headers, t: string | null, videoId: string, partes: readonly string[]): Promise<Response> {
  const caminho = lerCaminhoHls(partes);
  if (!UUID.test(videoId) || !caminho) return nao(404);
  const criadorId = await criadorDoHost(h);
  if (!criadorId) return nao(404);
  const token = lerToken(t, videoId, criadorId);
  if ("recusa" in token || !t) return nao("recusa" in token ? token.recusa : 403);

  const chave = chaveDoCriador(criadorId, "videos", videoId, ...caminho.relativo.split("/"));
  if (caminho.tipo === "segmento" && !token.vencido) {
    const url = await urlDeLeitura({ bucket: "hls", criadorId, chave, validadeSeg: VALIDADE_SEGMENTO_SEG });
    return new Response(null, { status: 302, headers: { Location: url, ...SEM_CACHE } });
  }

  const r = await conferirTudo(h, criadorId, token.dados);
  if ("recusa" in r) return nao(r.recusa);
  if (caminho.tipo === "segmento") {
    const url = await urlDeLeitura({ bucket: "hls", criadorId, chave, validadeSeg: VALIDADE_SEGMENTO_SEG });
    return new Response(null, { status: 302, headers: { Location: url, ...SEM_CACHE } });
  }
  let texto = "";
  try {
    const partesTexto: Buffer[] = [];
    for await (const pedaco of await lerObjeto({ bucket: "hls", criadorId, chave })) partesTexto.push(Buffer.from(pedaco as Uint8Array));
    texto = Buffer.concat(partesTexto).toString("utf8");
  } catch {
    return nao(404);
  }
  return new Response(reescreverPlaylist(texto, { token: t, uriChave: rotasVideo.chave(videoId) }), {
    headers: { "Content-Type": "application/vnd.apple.mpegurl", ...SEM_CACHE },
  });
}

export async function servirChave(h: Headers, t: string | null, videoId: string): Promise<Response> {
  if (!UUID.test(videoId)) return nao(404);
  const criadorId = await criadorDoHost(h);
  if (!criadorId) return nao(404);
  const token = lerToken(t, videoId, criadorId);
  if ("recusa" in token) return nao(token.recusa);
  const r = await conferirTudo(h, criadorId, token.dados);
  if ("recusa" in r) {
    if (r.recusa === 403) {
      await registrarAuditoriaSegura({
        userId: r.userId,
        criadorId,
        acao: "acesso_negado",
        tabela: "produtos_modulos_aulas_videos",
        registroId: videoId,
        detalhes: `Recusa da chave do vídeo: ${r.motivo}`,
      });
    }
    return nao(r.recusa);
  }
  return new Response(new Uint8Array(decifrarChave(r.video.chave_cifrada, r.video.id)), {
    headers: { "Content-Type": "application/octet-stream", "X-Content-Type-Options": "nosniff", ...SEM_CACHE },
  });
}

/** Situação do vídeo para a EQUIPE do criador do host (DONO/ADMIN). Outro criador = 404. */
export async function situacaoParaEquipe(h: Headers, videoId: string): Promise<Response> {
  if (!UUID.test(videoId)) return nao(404);
  const criadorId = await criadorDoHost(h);
  if (!criadorId) return nao(404);
  const s = await sessaoDosCabecalhos(h);
  if (!s || s.provisoria) return nao(403);
  if (!papelAceito(s.acesso, EQUIPE)) return nao(403);
  const v = await videoVivo(criadorId, videoId);
  if (!v) return nao(404);
  return Response.json(estadoDoVideo(v), { headers: SEM_CACHE });
}
