import "server-only";
import { and, count, eq, gte, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import type { RecusaIntegracao } from "@/lib/db/schema/_enums";
import { criadores_integracoes as integ, criadores_integracoes_eventos as ev, integracoes_recibos as recibos, type Integracao } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { decifrarSegredo } from "@/lib/webhooks/segredo";
import { assinaturaEduzzConfere, hottokConfere } from "./autenticidade";
import { enfileirarComPrazo } from "./fila";
import { normalizar, plataformaDoSegmento, TAMANHO_MAXIMO_CORPO, TETO_RECUSAS_POR_CONEXAO } from "./regras";
import { aadDaIntegracao } from "./servico";

/**
 * Recepção do webhook da Hotmart e da Eduzz (ADR-0021 item 3): a URL leva o id da conexão (diz QUAL
 * segredo conferir e de qual criador é), a credencial é o hottok/assinatura conferido em tempo
 * constante. Grava o recibo (append-only, idempotente pelo id do evento, sem dado pessoal) e a linha de
 * processamento (o comprador fica só nela) e enfileira — responde rápido; o trabalho é do worker.
 * Fila fora do ar = 500 (a plataforma reenvia e o reenvio, já com recibo, só enfileira de novo).
 */

export interface RespostaIntegracao {
  status: number;
  corpo: { recebido: boolean; erro?: string };
}

const nao = (status: number, erro: string): RespostaIntegracao => ({ status, corpo: { recebido: false, erro } });
const DEZ_MINUTOS_MS = 10 * 60_000;

/** Recusa gravada (a tela mostra "Recusado") até o teto por conexão; acima dele, só responde. */
async function registrarRecusa(i: Integracao, recusa: RecusaIntegracao) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(recibos)
    .where(and(eq(recibos.integracao_id, i.id), isNotNull(recibos.recusa), gte(recibos.created_at, new Date(Date.now() - DEZ_MINUTOS_MS))));
  if (n >= TETO_RECUSAS_POR_CONEXAO) return;
  await db.insert(recibos).values({ criador_id: i.criador_id, integracao_id: i.id, plataforma: i.plataforma, recusa });
}

export async function receberEventoIntegracao(
  p: { segmento: string; integracaoId: string; corpo: string; cabecalhos: Headers },
  enfileirar: (ids: string[]) => Promise<boolean> = (ids) => enfileirarComPrazo(ids),
): Promise<RespostaIntegracao> {
  const plataforma = plataformaDoSegmento(p.segmento);
  if (!plataforma || !z.uuid().safeParse(p.integracaoId).success) return nao(404, "Integração não encontrada.");
  if (p.corpo.length > TAMANHO_MAXIMO_CORPO) return nao(413, "Corpo grande demais.");
  const [i] = await db.select().from(integ).where(and(eq(integ.id, p.integracaoId), eq(integ.plataforma, plataforma), vivos(integ)));
  if (!i) return nao(404, "Integração não encontrada.");

  const segredo = decifrarSegredo(i.segredo_cifrado, aadDaIntegracao(i.id));
  const autentico =
    plataforma === "HOTMART" ? hottokConfere(p.cabecalhos.get("x-hotmart-hottok"), segredo) : assinaturaEduzzConfere(p.cabecalhos.get("x-signature"), segredo, p.corpo);
  if (!autentico) {
    await registrarRecusa(i, "TOKEN_INVALIDO");
    return nao(401, "Token inválido.");
  }

  let json: unknown;
  try {
    json = JSON.parse(p.corpo);
  } catch {
    json = null;
  }
  const eventos = normalizar(plataforma, json);
  if (!eventos) {
    await registrarRecusa(i, "FORMATO_INVALIDO");
    return nao(400, "Formato inesperado.");
  }

  const pendentes = await db.transaction(async (tx) => {
    const ids: string[] = [];
    for (const e of eventos) {
      const [novo] = await tx
        .insert(recibos)
        .values({
          criador_id: i.criador_id,
          integracao_id: i.id,
          plataforma,
          evento_id: e.eventoId,
          evento: e.evento,
          tipo: e.tipo,
          transacao: e.transacao,
          assinatura: e.assinatura,
          produto_externo: e.produtoExterno,
          ocorrido_em: e.ocorridoEm,
        })
        .onConflictDoNothing()
        .returning({ id: recibos.id });
      if (!novo) {
        // Reentrega: o recibo já existe; se ainda está na fila, enfileira de novo (não duplica: jobId).
        const [ja] = await tx
          .select({ id: ev.id, situacao: ev.situacao })
          .from(ev)
          .innerJoin(recibos, eq(recibos.id, ev.recibo_id))
          .where(and(eq(recibos.integracao_id, i.id), eq(recibos.evento_id, e.eventoId)));
        if (ja?.situacao === "PENDENTE") ids.push(ja.id);
        continue;
      }
      const tratado = e.tipo !== "OUTRO";
      const [linha] = await tx
        .insert(ev)
        .values({
          criador_id: i.criador_id,
          recibo_id: novo.id,
          situacao: tratado ? "PENDENTE" : "IGNORADO",
          // O comprador só é guardado se o evento ainda vai ser processado (e some ao processar).
          comprador_email: tratado ? e.email : null,
          comprador_nome: tratado ? e.nome : null,
          proxima_cobranca: e.proximaCobranca,
          processado_em: tratado ? null : new Date(),
          modified_by: i.modified_by,
        })
        .returning({ id: ev.id });
      if (tratado) ids.push(linha.id);
    }
    return ids;
  });

  if (pendentes.length && !(await enfileirar(pendentes))) return nao(500, "Fila indisponível.");
  return { status: 200, corpo: { recebido: true } };
}
