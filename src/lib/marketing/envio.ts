import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { motivoParaNaoGerarLink } from "@/lib/auth/link-de-senha-regra";
import { urlDaPlataforma } from "@/lib/criador/area";
import { urlDaArea } from "@/lib/criador/host";
import { db } from "@/lib/db";
import {
  criadores,
  criadores_automacoes as auto,
  criadores_campanhas as camp,
  criadores_emails_envios as envios,
  criadores_leads as leads,
  criadores_membros as m,
  usuarios as u,
} from "@/lib/db/schema";
import type { ConteudoMarketing } from "@/lib/db/schema/marketing";
import { vivos } from "@/lib/db/soft-delete";
import { hashDoDestinatario } from "@/lib/email/disparos";
import type { Email } from "@/lib/email/enviar";
import { emailMarketing, emailPrimeiroAcesso } from "@/lib/email/mensagens";
import { marcaDaArea } from "@/lib/email/modelo";
import { concluirCampanhaSeTerminou } from "./campanhas";
import { provedorEmail, esperaParaEnviar, type ProvedorEmail } from "./provedor";
import { descadastradosEntre } from "./publico";
import { atorDoLink, alvosDoLink } from "./reenvio";
import { MOTIVOS_ENVIO } from "./regras";
import { assinaturaAbertura, assinaturaClique, tokenDescadastro } from "./tokens";

/**
 * UM ENVIO da fila `emails` (6º Worker de `worker:certificados`). Idempotente: só sai envio PENDENTE e
 * a baixa é condicional (reprocessar o job não reenvia). Antes do teto confere o que tira o envio da
 * fila de propósito (descadastro, campanha cancelada, automação pausada, membro inativo ou lead removido,
 * regra do link); o destinatário é o membro OU o lead do envio (ADR-0023);
 * depois o teto (`adiado` = o worker para a fila pelo tempo devolvido e o job volta a esperar). Falha do
 * provedor LANÇA para o BullMQ refazer; na última tentativa vira FALHOU. Atualização de sistema: não
 * mexe em `updated_at`.
 */
export type ResultadoEnvio = { r: "enviado" } | { r: "ignorado"; motivo: string | null } | { r: "adiado"; esperaMs: number };

const ESPERA_SEM_PROVEDOR_MS = 15 * 60_000;

export interface DependenciasEnvio {
  provedor?: ProvedorEmail;
  /** ms até caber o próximo envio (teto). */
  espera?: () => Promise<number>;
}

const codigoDoErro = (e: unknown) => {
  const x = e as { code?: unknown; name?: unknown } | null;
  return (typeof x?.code === "string" ? x.code : typeof x?.name === "string" ? x.name : "Erro").slice(0, 120);
};

/** Links do e-mail de marketing NA ÁREA (host do criador: as rotas conferem o criador pelo host). */
export function linksDoEnvio(area: string, criadorId: string, envioId: string, email: string) {
  const descadastro = `${area}/api/email/descadastro?t=${tokenDescadastro(criadorId, email)}`;
  return {
    descadastro,
    pixel: `${area}/api/email/abertura?e=${envioId}&s=${assinaturaAbertura(envioId)}`,
    linkar: (url: string) => `${area}/api/email/clique?e=${envioId}&u=${encodeURIComponent(url)}&s=${assinaturaClique(envioId, url)}`,
    cabecalhos: { "List-Unsubscribe": `<${descadastro}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

async function baixa(envioId: string, campos: Partial<typeof envios.$inferInsert>, campanhaId: string | null) {
  await db.update(envios).set(campos).where(and(eq(envios.id, envioId), eq(envios.situacao, "PENDENTE")));
  if (campanhaId) await concluirCampanhaSeTerminou(campanhaId);
}

export async function processarEnvio(envioId: string, tentativa: number, maxTentativas: number, deps: DependenciasEnvio = {}): Promise<ResultadoEnvio> {
  const provedor = deps.provedor ?? provedorEmail();
  const [e] = await db
    .select({
      envio: envios,
      email: sql<string>`coalesce(${u.email}, ${leads.email})`,
      nome: sql<string>`coalesce(${u.nome}, ${leads.nome})`,
      usuarioId: u.id,
      pessoaOk: sql<boolean>`case when ${envios.lead_id} is not null then coalesce(not ${leads.is_deleted}, false)
        else coalesce(${u.ativo} and not ${u.is_deleted} and not ${m.is_deleted} and ${m.status} = 'ATIVO', false) end`,
      criador: { id: criadores.id, slug: criadores.slug, nome: criadores.nome, cor_marca: criadores.cor_marca },
      campanha: { situacao: camp.situacao, conteudo: camp.conteudo },
      automacao: { situacao: auto.situacao, viva: sql<boolean>`not ${auto.is_deleted}`, conteudo: auto.conteudo },
    })
    .from(envios)
    .leftJoin(m, eq(m.id, envios.membro_id))
    .leftJoin(u, eq(u.id, m.usuario_id))
    .leftJoin(leads, eq(leads.id, envios.lead_id))
    .innerJoin(criadores, eq(criadores.id, envios.criador_id))
    .leftJoin(camp, eq(camp.id, envios.campanha_id))
    .leftJoin(auto, eq(auto.id, envios.automacao_id))
    .where(and(eq(envios.id, envioId), vivos(envios)));
  if (!e || e.envio.situacao !== "PENDENTE") return { r: "ignorado", motivo: null };
  const { envio, criador } = e;
  const ignorar = async (motivo: string): Promise<ResultadoEnvio> => {
    await baixa(envioId, { situacao: "IGNORADO", motivo }, envio.campanha_id);
    return { r: "ignorado", motivo };
  };

  if (!e.pessoaOk) return ignorar(envio.lead_id ? MOTIVOS_ENVIO.LEAD : MOTIVOS_ENVIO.MEMBRO);
  let conteudo: ConteudoMarketing | null = null;
  if (envio.origem === "CAMPANHA") {
    if (e.campanha?.situacao !== "ENVIANDO") return ignorar(MOTIVOS_ENVIO.CANCELADA);
    conteudo = e.campanha.conteudo;
  } else if (envio.origem === "AUTOMACAO") {
    if (!e.automacao?.viva || e.automacao.situacao !== "ATIVA" || !e.automacao.conteudo) return ignorar(MOTIVOS_ENVIO.PAUSADA);
    conteudo = e.automacao.conteudo;
  }
  if (conteudo && (await descadastradosEntre(criador.id, [hashDoDestinatario(e.email)])).size) return ignorar(MOTIVOS_ENVIO.DESCADASTRADO);
  if (envio.origem === "PRIMEIRO_ACESSO") {
    // O CHECK do banco já impede PRIMEIRO_ACESSO de lead; sem conta = fora da regra do link.
    const alvo = e.usuarioId ? (await alvosDoLink([e.usuarioId])).get(e.usuarioId) : undefined;
    if (!alvo || motivoParaNaoGerarLink(await atorDoLink(envio.modified_by, criador.id), alvo) !== null) return ignorar(MOTIVOS_ENVIO.SEM_PERMISSAO);
  }
  // Worker sem SMTP (env esquecida no deploy): espera e tenta de novo; nunca perde a fila inteira.
  if (!provedor.configurado()) return { r: "adiado", esperaMs: ESPERA_SEM_PROVEDOR_MS };

  const espera = await (deps.espera ?? (() => esperaParaEnviar()))();
  if (espera > 0) return { r: "adiado", esperaMs: espera };

  const marca = marcaDaArea(criador, urlDaPlataforma());
  let email: Email;
  if (conteudo) {
    const l = linksDoEnvio(urlDaArea(urlDaPlataforma(), criador.slug), criador.id, envioId, e.email);
    email = { para: e.email, tipo: envio.origem === "CAMPANHA" ? "CAMPANHA" : "AUTOMACAO", criadorId: criador.id, cabecalhos: l.cabecalhos, ...emailMarketing(marca, conteudo, e.nome, l) };
  } else {
    // O link nasce agora (invalida os anteriores; trilha antes do efeito). Import tardio: só este caso carrega o Better Auth.
    const { gerarLinkDeSenha } = await import("@/lib/auth/recuperacao");
    const link = await gerarLinkDeSenha(e.usuarioId!, { id: criador.id, slug: criador.slug }, { id: envio.modified_by, motivo: "Reenvio do primeiro acesso em massa" });
    email = { para: e.email, tipo: "PRIMEIRO_ACESSO", criadorId: criador.id, ...emailPrimeiroAcesso(marca, e.nome, link.url, link.expiraEm) };
  }

  let ok: boolean;
  try {
    ok = await provedor.enviar(email);
  } catch (erro) {
    const final = tentativa >= maxTentativas;
    if (final) await baixa(envioId, { situacao: "FALHOU", tentativas: tentativa, motivo: codigoDoErro(erro) }, envio.campanha_id);
    else await db.update(envios).set({ tentativas: tentativa, motivo: codigoDoErro(erro) }).where(and(eq(envios.id, envioId), eq(envios.situacao, "PENDENTE")));
    throw new Error(`envio ${envioId}: ${codigoDoErro(erro)}`);
  }
  if (!ok) return ignorar(MOTIVOS_ENVIO.NAO_CONFIGURADO);
  await baixa(envioId, { situacao: "ENVIADO", tentativas: tentativa, motivo: null, enviado_em: new Date() }, envio.campanha_id);
  return { r: "enviado" };
}

/** Envios PENDENTES (fila fora do ar quando foram criados): o worker reenfileira ao subir. */
export async function enviosPendentes(limite = 20_000): Promise<string[]> {
  const linhas = await db.select({ id: envios.id }).from(envios).where(and(eq(envios.situacao, "PENDENTE"), vivos(envios))).orderBy(asc(envios.created_at)).limit(limite);
  return linhas.map((l) => l.id);
}

/**
 * ENVIO DE TESTE (RN-223): o conteúdo da tela vai para o e-mail de QUEM PEDIU, na hora (sem fila e
 * sem rastreio), com "[Teste]" no assunto. Conta no registro de disparos como os outros.
 */
export async function enviarTeste(p: { criador: { id: string; slug: string; nome: string; cor_marca: string | null }; para: string; nome: string; conteudo: ConteudoMarketing }, provedor = provedorEmail()): Promise<boolean> {
  const area = urlDaArea(urlDaPlataforma(), p.criador.slug);
  const descadastro = `${area}/api/email/descadastro?t=${tokenDescadastro(p.criador.id, p.para)}`;
  const msg = emailMarketing(marcaDaArea(p.criador, urlDaPlataforma()), p.conteudo, p.nome, { descadastro, linkar: (url) => url });
  return provedor.enviar({ para: p.para, tipo: "CAMPANHA", criadorId: p.criador.id, ...msg, assunto: `[Teste] ${msg.assunto}`.slice(0, 300) });
}
