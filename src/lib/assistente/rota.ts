import "server-only";
import { z, ZodError } from "zod";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoriaSegura } from "@/lib/audit/registrar";
import { papelEfetivo } from "@/lib/auth/permissoes";
import { sessaoDosCabecalhos } from "@/lib/auth/sessao";
import type { ClienteIA } from "./cliente";
import { ErroDeLimite } from "./conversas";
import { LIMITES_ASSISTENTE } from "./regras";
import { ErroIaNaoConfigurada, prepararResposta } from "./responder";

/**
 * `POST /api/assistente` (ADR-0014): pergunta -> resposta em streaming NDJSON (uma linha JSON por
 * evento: inicio, texto, substituir, fim, erro). Sem Next aqui (o route handler só repassa; o teste
 * chama direto com um cliente falso). Recusas ANTES do modelo, com JSON `{ erro }`: sem sessão do
 * HOST = 401; sem vínculo ou teste por ALUNO = 403 (na trilha); dados inválidos = 400; limite = 429;
 * IA não configurada = 503. Cliente desconectou = o modelo é abortado e o que chegou é gravado.
 */

const entradaSchema = z.strictObject({
  pergunta: z
    .string()
    .trim()
    .min(2, "Escreva a sua pergunta.")
    .max(LIMITES_ASSISTENTE.pergunta, `Pergunta longa demais (máximo de ${LIMITES_ASSISTENTE.pergunta} caracteres).`),
  conversaId: z.uuid().nullable().default(null),
  aulaId: z.uuid().nullable().default(null),
  teste: z.boolean().default(false),
});

const TETO_CORPO = 8 * 1024;
const json = (status: number, erro: string) => Response.json({ erro }, { status, headers: { "Cache-Control": "private, no-store" } });

/** CSRF: só JSON (outro site precisaria de preflight) e, com Origin, o próprio host. */
function deOutroSite(h: Headers): boolean {
  if (!(h.get("content-type") ?? "").startsWith("application/json")) return true;
  const origem = h.get("origin");
  if (!origem) return false;
  try {
    return new URL(origem).host !== h.get("host");
  } catch {
    return true;
  }
}

export async function responderPorRota(req: Request, cliente: ClienteIA | null): Promise<Response> {
  if (deOutroSite(req.headers)) return json(403, "Requisição recusada.");
  const s = await sessaoDosCabecalhos(req.headers);
  if (!s || s.provisoria) return json(401, "Sessão expirada. Entre novamente.");
  if (s.alvo.tipo !== "criador") return json(404, "Não encontrado.");
  const papel = papelEfetivo(s.acesso);
  if (!papel) return json(403, "Sem permissão para esta ação.");

  const bruto = await req.text();
  if (bruto.length > TETO_CORPO) return json(400, "Pergunta longa demais.");
  let entrada: z.infer<typeof entradaSchema>;
  try {
    entrada = entradaSchema.parse(JSON.parse(bruto || "{}"));
  } catch (e) {
    return json(400, e instanceof ZodError ? (e.issues[0]?.message ?? "Dados inválidos.") : "Dados inválidos.");
  }
  const criador = s.alvo.criador;
  if (entrada.teste && papel === "ALUNO") {
    await registrarAuditoriaSegura({
      userId: s.userId,
      criadorId: criador.id,
      acao: "acesso_negado",
      tabela: "criadores_assistentes_conversas",
      registroId: null,
      detalhes: "Recusa 403: teste do assistente exige DONO ou ADMIN",
    });
    return json(403, "Sem permissão para esta ação.");
  }

  let preparo: Awaited<ReturnType<typeof prepararResposta>>;
  try {
    preparo = await prepararResposta(cliente, { criadorId: criador.id, nomeArea: criador.nome, usuarioId: s.userId, membroId: s.acesso.membro?.id ?? null, papel }, entrada);
  } catch (e) {
    if (e instanceof ErroDeLimite) return json(429, e.message);
    if (e instanceof ErroIaNaoConfigurada) return json(503, e.message);
    if (e instanceof ErroDeNegocio) return json(400, e.message);
    console.error("[assistente] falha ao preparar a resposta:", e);
    return json(500, "Falha inesperada. Tente novamente.");
  }

  const controle = new AbortController();
  const aoSair = () => controle.abort();
  req.signal?.addEventListener("abort", aoSair, { once: true });
  const codificador = new TextEncoder();
  const corpo = new ReadableStream<Uint8Array>({
    async start(c) {
      try {
        // Sem `break` no aborto: o gerador precisa ver o erro do modelo abortado para gravar o que chegou.
        for await (const ev of preparo.eventos(controle.signal)) {
          if (controle.signal.aborted) continue;
          try {
            c.enqueue(codificador.encode(`${JSON.stringify(ev)}\n`));
          } catch {
            controle.abort();
          }
        }
      } catch (e) {
        console.error("[assistente] falha no streaming:", e);
        if (!controle.signal.aborted) c.enqueue(codificador.encode(`${JSON.stringify({ tipo: "erro", mensagem: "Falha inesperada. Tente novamente." })}\n`));
      } finally {
        req.signal?.removeEventListener("abort", aoSair);
        try {
          c.close();
        } catch {
          // já fechado pelo cancelamento
        }
      }
    },
    cancel() {
      controle.abort();
    },
  });
  return new Response(corpo, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
