import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db } from "@/lib/db";
import {
  criadores_integracoes as integ,
  criadores_integracoes_pedidos as pedidos,
  criadores_integracoes_pedidos_resgates as resgates,
  criadores_integracoes_produtos as mapa,
  criadores_membros,
  produtos,
  usuarios,
  type MatriculaDaVenda,
} from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { mascararEmail } from "@/lib/email/disparos";
import { vincularPessoa, violouUnico } from "@/lib/membros/vinculos";
import { concederAcesso } from "@/lib/pagamentos/acesso";
import { conferirTetoResgate, depoisDoResgate, registrarRecusaResgate, type ResultadoResgatePublico } from "@/lib/resgates/publico";
import { iguaisEmTempoConstante } from "../autenticidade";
import { acessoAte, referenciaDoAcesso } from "../regras";
import { hmacDoCpf } from "./cpf";
import { sincronizarPorNumero } from "./pedidos";
import { normalizarNumeroLoja } from "./regras";

/**
 * Porta (a) do resgate público: número do pedido do marketplace + CPF (ADR-0024 item 7, RN-262 a RN-264).
 * Casa o pedido da conexão Bling DESTE criador (host) pelo número (sem caixa) e pelo HMAC do CPF; sem o
 * pedido no espelho, UMA busca na API antes de recusar. Daí segue o caminho da compra aprovada da Hotmart:
 * `vincularPessoa` + ALUNO + `concederAcesso` (origem COMPRA, referência `bling:<pedido>:<curso>`) e o
 * primeiro acesso depois do commit. UM resgate por pedido (índice único + trava da linha do pedido).
 */

export const MSG_RECUSA_PEDIDO = "Não encontramos um pedido com esse número e CPF. Confira os dados ou tente de novo em alguns minutos.";
export const MSG_PEDIDO_CANCELADO = "Este pedido foi cancelado ou devolvido no marketplace e não libera o curso.";
const msgJaResgatado = (mascara: string | null) =>
  `Este pedido já foi resgatado. Entre com o e-mail usado no resgate${mascara ? ` (${mascara})` : ""}. Esqueceu a senha? Use "Esqueci a senha" no login.`;
const TABELA = "criadores_integracoes_pedidos";

/** Pedidos do número (sem caixa) cujo HMAC do CPF bate. */
async function pedidoDoComprador(integracaoId: string, numero: string, hmac: string) {
  const linhas = await db
    .select({ id: pedidos.id, pedidoId: pedidos.pedido_id, cpf: pedidos.cpf_hmac })
    .from(pedidos)
    .where(and(eq(pedidos.integracao_id, integracaoId), sql`lower(${pedidos.numero_loja}) = lower(${numero})`, vivos(pedidos)));
  return { existe: linhas.length > 0, casou: linhas.find((l) => !!l.cpf && iguaisEmTempoConstante(l.cpf, hmac)) ?? null };
}

type Desfecho = { tipo: "cancelado" } | { tipo: "ja-resgatado"; mascara: string | null } | { tipo: "sem-curso" } | { tipo: "ok"; v: Awaited<ReturnType<typeof vincularPessoa>>; matriculas: MatriculaDaVenda[] };

export async function resgatarPedidoMarketplace(p: { criadorId: string; numeroPedido: string; cpf: string; nome: string; email: string; ip: string; agora?: Date }): Promise<ResultadoResgatePublico> {
  const agora = p.agora ?? new Date();
  const numero = normalizarNumeroLoja(p.numeroPedido);
  await conferirTetoResgate({ criadorId: p.criadorId, ip: p.ip, alvo: `pedido:${numero.toLowerCase()}`, tabela: TABELA });
  const recusar = async (motivo: string, registroId?: string): Promise<never> => {
    await registrarRecusaResgate({ criadorId: p.criadorId, tabela: TABELA, registroId, detalhes: `Resgate de pedido recusado (${motivo}) · pedido ${numero}`, ip: p.ip });
    throw new ErroDeNegocio(MSG_RECUSA_PEDIDO);
  };

  const [i] = await db.select({ id: integ.id, autor: integ.modified_by }).from(integ).where(and(eq(integ.criador_id, p.criadorId), eq(integ.plataforma, "BLING"), vivos(integ)));
  if (!i) return recusar("Bling não conectado");
  const hmac = hmacDoCpf(p.criadorId, p.cpf);
  let achado = await pedidoDoComprador(i.id, numero, hmac);
  // Aviso atrasado/perdido: o pedido ainda não está aqui. Número que já existe (CPF errado) não consulta a API.
  if (!achado.existe) {
    await sincronizarPorNumero({ criadorId: p.criadorId, integracaoId: i.id, autor: i.autor, numeroLoja: numero });
    achado = await pedidoDoComprador(i.id, numero, hmac);
  }
  if (!achado.casou) return recusar(achado.existe ? "CPF não confere" : "pedido não encontrado");
  const alvo = achado.casou;

  let d: Desfecho;
  try {
    d = await db.transaction(async (tx): Promise<Desfecho> => {
      const [ped] = await tx.select().from(pedidos).where(eq(pedidos.id, alvo.id)).for("update");
      if (ped.situacao === "CANCELADO") return { tipo: "cancelado" };
      const [ja] = await tx
        .select({ email: usuarios.email })
        .from(resgates)
        .innerJoin(criadores_membros, eq(criadores_membros.id, resgates.membro_id))
        .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
        .where(eq(resgates.pedido_id, ped.id));
      if (ja) return { tipo: "ja-resgatado", mascara: mascararEmail(ja.email) };
      const cursos = ped.skus.length
        ? await tx
            .selectDistinctOn([mapa.produto_id], { produtoId: mapa.produto_id, diasAcesso: mapa.dias_acesso })
            .from(mapa)
            .innerJoin(produtos, eq(produtos.id, mapa.produto_id))
            .where(and(eq(mapa.integracao_id, i.id), inArray(mapa.produto_externo, ped.skus), vivos(mapa), vivos(produtos)))
            .orderBy(mapa.produto_id)
        : [];
      if (cursos.length === 0) return { tipo: "sem-curso" };

      const v = await vincularPessoa(tx, { criadorId: p.criadorId, autorId: null, nome: p.nome, email: p.email, papel: "ALUNO" });
      const matriculas: MatriculaDaVenda[] = [];
      for (const c of cursos) {
        const ate = acessoAte({ proximaCobranca: null, diasAcesso: c.diasAcesso }, agora);
        matriculas.push(await concederAcesso(tx, { criadorId: p.criadorId, membroId: v.membroId, produtoId: c.produtoId, ate, referencia: referenciaDoAcesso(`bling:${ped.pedido_id}`, c.produtoId), agora }));
      }
      const [r] = await tx.insert(resgates).values({ criador_id: p.criadorId, pedido_id: ped.id, membro_id: v.membroId, matriculas, modified_by: v.usuarioId }).returning({ id: resgates.id });
      await registrarAuditoria(tx, {
        userId: null,
        criadorId: p.criadorId,
        acao: "criar",
        tabela: "criadores_integracoes_pedidos_resgates",
        registroId: r.id,
        detalhes: `Pedido ${ped.numero_loja ?? ped.pedido_id} do marketplace resgatado pelo comprador · IP ${p.ip}`,
        dadosNovos: { pedido_id: ped.id, membro_id: v.membroId, matriculas },
      });
      return { tipo: "ok", v, matriculas };
    });
  } catch (e) {
    // Dois resgates do mesmo pedido ao mesmo tempo: o índice único segura o segundo.
    if (violouUnico(e)) throw new ErroDeNegocio(msgJaResgatado(null));
    throw e;
  }

  if (d.tipo === "sem-curso") return recusar("nenhum SKU do pedido mapeado", alvo.id);
  if (d.tipo === "cancelado") {
    await registrarRecusaResgate({ criadorId: p.criadorId, tabela: TABELA, registroId: alvo.id, detalhes: `Resgate de pedido recusado (cancelado) · pedido ${numero}`, ip: p.ip });
    throw new ErroDeNegocio(MSG_PEDIDO_CANCELADO);
  }
  if (d.tipo === "ja-resgatado") {
    await registrarRecusaResgate({ criadorId: p.criadorId, tabela: TABELA, registroId: alvo.id, detalhes: `Resgate de pedido recusado (já resgatado) · pedido ${numero}`, ip: p.ip });
    throw new ErroDeNegocio(msgJaResgatado(d.mascara));
  }
  const novas = d.matriculas.filter((m) => m.resultado !== "ja-existia").map((m) => m.matriculaId);
  const contaNova = await depoisDoResgate(p.criadorId, d.v, p.email, p.nome, novas);
  return { contaNova, cursos: d.matriculas.length };
}
