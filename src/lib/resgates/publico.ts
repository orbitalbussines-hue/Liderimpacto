import "server-only";
import { ErroDeNegocio } from "@/lib/acao";
import { registrarAuditoriaSegura } from "@/lib/audit/registrar";
import { chaveDeIp } from "@/lib/auth/ip";
import { estourouTeto } from "@/lib/auth/teto";
import { db } from "@/lib/db";
import { automacaoVoucherResgatado } from "@/lib/marketing/gatilhos";
import { vincularPessoa, violouUnico, type ResultadoVinculo } from "@/lib/membros/vinculos";
import { depoisDaVenda } from "@/lib/pagamentos/processar";
import { resgatarVoucher } from "@/lib/vouchers/servico";

/**
 * Resgate PÚBLICO, sem login (ADR-0024 item 7, RN-263 e RN-266): quem comprou fora ainda não tem conta.
 * Duas portas na mesma página — pedido do marketplace (Bling, `integracoes/bling/resgate.ts`) e código de
 * voucher (aqui) — com as mesmas defesas: teto persistido no banco por IP e por alvo (pedido/código),
 * recusa com mensagem ÚNICA (não enumera pedido nem código) e trilha da tentativa sem CPF. Deu certo: a
 * pessoa vira ALUNO pelo `vincularPessoa` (conta nova recebe o primeiro acesso; conta existente entra com
 * a senha de sempre), como no caminho da compra.
 */

export const MSG_TETO_RESGATE = "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
export const MSG_RECUSA_CODIGO = "Não foi possível usar este código. Confira o código digitado ou fale com a equipe que enviou.";
/** Por IP (as duas portas somam) e por alvo, na janela de 15 min (`MAIOR_JANELA_S` do teto). */
export const TETO_RESGATE = { janelaSeg: 900, porIp: 10, porAlvo: 5 } as const;

export interface ResultadoResgatePublico {
  /** Conta criada agora: o e-mail de primeiro acesso foi pedido. Senão, entra com a senha que já usa. */
  contaNova: boolean;
  cursos: number;
}

/** Trilha da tentativa recusada: motivo e IP, nunca CPF nem e-mail digitado. */
export async function registrarRecusaResgate(p: { criadorId: string; tabela: string; registroId?: string | null; detalhes: string; ip: string }) {
  await registrarAuditoriaSegura({ userId: null, criadorId: p.criadorId, acao: "acesso_negado", tabela: p.tabela, registroId: p.registroId ?? null, detalhes: `${p.detalhes} · IP ${p.ip}`.slice(0, 500) });
}

/** Lança `MSG_TETO_RESGATE` se o IP ou o alvo passaram do teto (a tentativa conta mesmo recusada). */
export async function conferirTetoResgate(p: { criadorId: string; ip: string; alvo: string; tabela: string }) {
  const ip = await estourouTeto(`resgate-ip:${chaveDeIp(p.ip)}`, TETO_RESGATE.janelaSeg, TETO_RESGATE.porIp);
  const alvo = await estourouTeto(`resgate:${p.criadorId}:${p.alvo}`, TETO_RESGATE.janelaSeg, TETO_RESGATE.porAlvo);
  if (!ip && !alvo) return;
  await registrarRecusaResgate({ criadorId: p.criadorId, tabela: p.tabela, detalhes: `Resgate público recusado: teto de tentativas ${ip ? "do IP" : "do alvo"}`, ip: p.ip });
  throw new ErroDeNegocio(MSG_TETO_RESGATE);
}

/** Depois do commit (nunca lança): avisos, webhooks e o primeiro acesso da conta nova. */
export async function depoisDoResgate(criadorId: string, v: ResultadoVinculo, email: string, nome: string, novas: string[]) {
  const contaNova = v.tipo === "vinculado" && v.identidadeNova;
  await depoisDaVenda(criadorId, { novas, membroId: v.membroId, membroNovo: v.tipo === "vinculado", contaNova: contaNova ? { usuarioId: v.usuarioId, email, nome } : null });
  return contaNova;
}

/**
 * Porta (b): código de voucher + nome + e-mail. Reaproveita o `resgatarVoucher` inteiro (trava do
 * voucher, validade, limites, "já tem acesso"), com a pessoa criada/vinculada como ALUNO na MESMA
 * transação — recusa desfaz tudo (nenhuma conta nasce de código errado). Toda recusa vira a mesma frase.
 */
export async function resgatarCodigoPublico(p: { criadorId: string; codigo: string; nome: string; email: string; ip: string }): Promise<ResultadoResgatePublico> {
  const TABELA = "criadores_vouchers_resgates";
  await conferirTetoResgate({ criadorId: p.criadorId, ip: p.ip, alvo: `codigo:${p.codigo}`, tabela: TABELA });
  let r;
  try {
    r = await db.transaction(async (tx) => {
      const v = await vincularPessoa(tx, { criadorId: p.criadorId, autorId: null, nome: p.nome, email: p.email, papel: "ALUNO" });
      const resgate = await resgatarVoucher(tx, { criadorId: p.criadorId, membroId: v.membroId, usuarioId: v.usuarioId, codigo: p.codigo });
      return { v, resgate };
    });
  } catch (e) {
    if (!(e instanceof ErroDeNegocio) && !violouUnico(e)) throw e;
    // O motivo real (expirado, esgotado, já tem acesso) fica só na trilha.
    await registrarRecusaResgate({ criadorId: p.criadorId, tabela: TABELA, detalhes: `Resgate público de voucher recusado: ${e instanceof ErroDeNegocio ? e.message : "resgate simultâneo"}`, ip: p.ip });
    throw new ErroDeNegocio(MSG_RECUSA_CODIGO);
  }
  const contaNova = await depoisDoResgate(p.criadorId, r.v, p.email, p.nome, r.resgate.novas);
  await automacaoVoucherResgatado(p.criadorId, r.resgate.resgateId); // nunca lança (RN-225)
  return { contaNova, cursos: r.resgate.matriculas.length };
}
