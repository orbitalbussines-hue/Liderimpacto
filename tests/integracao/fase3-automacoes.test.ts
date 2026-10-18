/**
 * Fase 3 (ADR-0020, RN-224 a RN-226) no PostgreSQL real + Redis — automações: dispara 1x por
 * referência, filtro de curso, só ALUNO, pausada não dispara, gancho real (conclusão de aula), atraso,
 * varredura de inatividade/nunca acessou, tag + e-mail; reenvio do primeiro acesso em massa (regra do
 * link, links novos invalidando os antigos) e permissão por action. Provedor FALSO: nada sai de verdade.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador, vincular } from "./_apoio";
import { conteudo, grupoCom, provedorFalso } from "./_marketing";
import { concluirAulas } from "./_passo7";
import { alunoMatriculado, cursoPronto, matricular, membroCom } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;
let autos: typeof import("@/lib/marketing/automacoes");
let execucoes: typeof import("@/lib/marketing/execucoes");
let envio: typeof import("@/lib/marketing/envio");
let reenvio: typeof import("@/lib/marketing/reenvio");
let consultas: typeof import("@/lib/marketing/consultas");
let emitir: typeof import("@/lib/webhooks/emitir");
let provedor: typeof import("@/lib/marketing/provedor");
let acoesCamp: typeof import("@/lib/actions/campanhas");
let acoesAuto: typeof import("@/lib/actions/automacoes");

beforeAll(async () => {
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
  autos = await import("@/lib/marketing/automacoes");
  execucoes = await import("@/lib/marketing/execucoes");
  envio = await import("@/lib/marketing/envio");
  reenvio = await import("@/lib/marketing/reenvio");
  consultas = await import("@/lib/marketing/consultas");
  emitir = await import("@/lib/webhooks/emitir");
  provedor = await import("@/lib/marketing/provedor");
  acoesCamp = await import("@/lib/actions/campanhas");
  acoesAuto = await import("@/lib/actions/automacoes");
});

afterAll(async () => {
  provedor.usarProvedorEmail(provedor.provedorSmtp);
  const fila = await import("@/lib/marketing/fila");
  await Promise.all([fila.filaEmails().close(), fila.filaMarketing().close()]);
});

const semTeto = { espera: async () => 0 };
const execucoesDe = (automacaoId: string) => db.select().from(s.criadores_automacoes_execucoes).where(eq(s.criadores_automacoes_execucoes.automacao_id, automacaoId));

async function automacaoAtiva(criadorId: string, autor: string, p: Partial<import("@/lib/marketing/automacoes").DadosAutomacao> & { gatilho: import("@/lib/db/schema/_enums").GatilhoAutomacao }) {
  const a = await db.transaction((tx) =>
    autos.criarAutomacao(tx, { criadorId, autor, nome: "Automação", produtoId: null, dias: null, atrasoMinutos: 0, conteudo: conteudo(), tagId: null, ...p }),
  );
  const v = await db.transaction((tx) => autos.mudarSituacaoAutomacao(tx, { criadorId, autor, automacaoId: a.id, versao: a.versao, situacao: "ATIVA" }));
  return { id: a.id, versao: v.versao };
}

describe("automações por gatilho", () => {
  it("matrícula criada: 1x por referência, só do curso escolhido, só ALUNO; executa tag + e-mail; pausada não dispara", async () => {
    const falso = provedorFalso();
    const A = await novoCriador();
    const dono = await membroCom(A.id, "DONO");
    const { produto } = await cursoPronto(A.id, { aulas: 1 });
    const { produto: outro } = await cursoPronto(A.id, { aulas: 1 });
    const [tag] = await db.insert(s.criadores_tags).values({ criador_id: A.id, nome: "Novo aluno", modified_by: dono.usuario.id }).returning();
    const a = await automacaoAtiva(A.id, dono.usuario.id, { gatilho: "MATRICULA_CRIADA", produtoId: produto.id, tagId: tag.id });

    const ana = await membroCom(A.id);
    const admin = await membroCom(A.id, "ADMIN");
    const m1 = await matricular(A.id, ana.membro.id, produto.id);
    const m2 = await matricular(A.id, ana.membro.id, outro.id);
    const m3 = await matricular(A.id, admin.membro.id, produto.id);
    // Gancho real (o mesmo ponto do webhook), duas vezes: uma execução só.
    await emitir.webhookMatriculas(A.id, [m1.id, m2.id, m3.id], "MATRICULA_CRIADA", dono.usuario.id);
    await emitir.webhookMatriculas(A.id, [m1.id], "MATRICULA_CRIADA", dono.usuario.id);
    const ex = await execucoesDe(a.id);
    expect(ex).toHaveLength(1);
    expect(ex[0]).toMatchObject({ membro_id: ana.membro.id, referencia: `matricula:${m1.id}`, situacao: "AGENDADA" });
    // Cancelamento não é gatilho.
    await emitir.webhookMatriculas(A.id, [m2.id], "MATRICULA_CANCELADA", dono.usuario.id);
    expect(await execucoesDe(a.id)).toHaveLength(1);

    const r = await execucoes.processarExecucao(ex[0].id);
    expect(r.r).toBe("executada");
    expect(await execucoes.processarExecucao(ex[0].id)).toEqual({ r: "ignorada" });
    const [depois] = await execucoesDe(a.id);
    expect(depois).toMatchObject({ situacao: "CONCLUIDA", tag_aplicada: true });
    const tags = await db.select().from(s.criadores_membros_tags).where(and(eq(s.criadores_membros_tags.membro_id, ana.membro.id), eq(s.criadores_membros_tags.tag_id, tag.id)));
    expect(tags).toHaveLength(1);
    if (r.r !== "executada" || !r.envioId) throw new Error("sem envio");
    expect(await envio.processarEnvio(r.envioId, 1, 5, semTeto)).toEqual({ r: "enviado" });
    expect(falso.para(ana.usuario.email).map((e) => e.tipo)).toEqual(["AUTOMACAO"]);

    const lista = await consultas.listarAutomacoes(A.id);
    expect(lista[0]).toMatchObject({ id: a.id, execucoes: 1, enviados: 1, tag: "Novo aluno", produto: produto.titulo });
    const hist = await consultas.historicoDaAutomacao(A.id, a.id, { pagina: 1, porPagina: 10 });
    expect(hist?.linhas[0]).toMatchObject({ membroId: ana.membro.id, situacao: "CONCLUIDA", envioSituacao: "ENVIADO", tagAplicada: true });
    expect(await consultas.historicoDaAutomacao((await novoCriador()).id, a.id, { pagina: 1, porPagina: 10 })).toBeNull();

    // Pausada: o evento novo não dispara.
    await db.transaction((tx) => autos.mudarSituacaoAutomacao(tx, { criadorId: A.id, autor: dono.usuario.id, automacaoId: a.id, versao: a.versao, situacao: "PAUSADA" }));
    const beto = await membroCom(A.id);
    const m4 = await matricular(A.id, beto.membro.id, produto.id);
    await emitir.webhookMatriculas(A.id, [m4.id], "MATRICULA_CRIADA", dono.usuario.id);
    expect(await execucoesDe(a.id)).toHaveLength(1);
  });

  it("aula concluída pelo caminho real; atraso agenda para depois; pausar depois de agendar = IGNORADA; isolamento A×B", async () => {
    provedorFalso();
    const A = await novoCriador();
    const B = await novoCriador();
    const dono = await membroCom(A.id, "DONO");
    const comAtraso = await automacaoAtiva(A.id, dono.usuario.id, { gatilho: "AULA_CONCLUIDA", atrasoMinutos: 60 });
    const deB = await automacaoAtiva(B.id, dono.usuario.id, { gatilho: "AULA_CONCLUIDA" });
    const { produto, aulas } = await cursoPronto(A.id, { aulas: 2 });
    const ana = await alunoMatriculado(A.id, produto.id);
    await concluirAulas(A.id, ana, [aulas[0]]);
    const [x] = await execucoesDe(comAtraso.id);
    expect(x.referencia).toBe(`aula:${aulas[0].id}`);
    expect(x.executar_em.getTime()).toBeGreaterThan(Date.now() + 55 * 60_000);
    expect(await execucoesDe(deB.id)).toHaveLength(0);
    expect((await execucoes.processarExecucao(x.id)).r).toBe("cedo");

    await db.transaction((tx) => autos.mudarSituacaoAutomacao(tx, { criadorId: A.id, autor: dono.usuario.id, automacaoId: comAtraso.id, versao: comAtraso.versao, situacao: "PAUSADA" }));
    expect(await execucoes.processarExecucao(x.id, new Date(Date.now() + 2 * 3_600_000))).toEqual({ r: "ignorada" });
    expect((await execucoesDe(comAtraso.id))[0]).toMatchObject({ situacao: "IGNORADA" });
    // A FK composta recusa execução de A apontando para automação de B.
    await expect(db.insert(s.criadores_automacoes_execucoes).values({ criador_id: A.id, automacao_id: deB.id, membro_id: ana.membro.id, referencia: "x", executar_em: new Date(), modified_by: dono.usuario.id })).rejects.toThrow();
  });

  it("varredura: inatividade 1x por episódio, nunca acessou 1x; descadastrado recebe a tag mas não o e-mail", async () => {
    const falso = provedorFalso();
    const A = await novoCriador();
    const dono = await membroCom(A.id, "DONO");
    const inat = await automacaoAtiva(A.id, dono.usuario.id, { gatilho: "INATIVIDADE", dias: 7 });
    const nunca = await automacaoAtiva(A.id, dono.usuario.id, { gatilho: "NUNCA_ACESSOU", dias: 3 });
    const parado = await membroCom(A.id);
    const ativo = await membroCom(A.id);
    const novato = await membroCom(A.id);
    const dia = 86_400_000;
    await db.update(s.criadores_membros).set({ ultimo_acesso_em: new Date(Date.now() - 10 * dia) }).where(eq(s.criadores_membros.id, parado.membro.id));
    await db.update(s.criadores_membros).set({ ultimo_acesso_em: new Date(Date.now() - 2 * dia) }).where(eq(s.criadores_membros.id, ativo.membro.id));
    await db.update(s.criadores_membros).set({ created_at: new Date(Date.now() - 5 * dia) }).where(eq(s.criadores_membros.id, novato.membro.id));

    await execucoes.varreduraDiaria();
    await execucoes.varreduraDiaria(); // repetir não duplica
    const ei = await execucoesDe(inat.id);
    expect(ei.map((x) => x.membro_id)).toEqual([parado.membro.id]);
    expect((await execucoesDe(nunca.id)).map((x) => x.membro_id)).toEqual([novato.membro.id]);
    expect((await execucoesDe(nunca.id))[0].referencia).toBe("nunca-acessou");

    // Voltou e sumiu de novo: episódio novo, dispara de novo.
    await db.update(s.criadores_membros).set({ ultimo_acesso_em: new Date(Date.now() - 8 * dia) }).where(eq(s.criadores_membros.id, parado.membro.id));
    await execucoes.varreduraDiaria();
    expect(await execucoesDe(inat.id)).toHaveLength(2);

    // Descadastrado: a execução acontece, o envio fica IGNORADO.
    const { descadastrar } = await import("@/lib/marketing/descadastro");
    const { hashDoDestinatario } = await import("@/lib/email/disparos");
    await descadastrar(A.id, hashDoDestinatario(novato.usuario.email), "LINK");
    const [xn] = await execucoesDe(nunca.id);
    const r = await execucoes.processarExecucao(xn.id);
    if (r.r !== "executada" || !r.envioId) throw new Error("sem envio");
    expect(await envio.processarEnvio(r.envioId, 1, 5, semTeto)).toMatchObject({ r: "ignorado", motivo: expect.stringContaining("Descadastrado") });
    expect(falso.para(novato.usuario.email)).toHaveLength(0);
  });
});

describe("reenvio do primeiro acesso em massa", () => {
  it("conta pela regra do link, gera link NOVO por pessoa na hora do envio e invalida o anterior", async () => {
    const falso = provedorFalso();
    const A = await novoCriador();
    const B = await novoCriador();
    const dono = await membroCom(A.id, "DONO");
    const ana = await membroCom(A.id);
    const beto = await membroCom(A.id);
    const emDuas = await membroCom(A.id);
    await vincular(B.id, emDuas.usuario.id, "ALUNO");
    const fora = await membroCom(A.id);
    const grupo = await grupoCom(A.id, [ana.membro.id, beto.membro.id, emDuas.membro.id]);
    await db.update(s.criadores_membros).set({ ultimo_acesso_em: new Date() }).where(eq(s.criadores_membros.id, beto.membro.id));
    const publico = { grupoIds: [grupo.id], tagIds: [], produtoIds: [], nuncaAcessou: true };
    const ator = await reenvio.atorDoLink(dono.usuario.id, A.id);
    expect(await reenvio.contarReenvio(A.id, ator, publico)).toEqual({ total: 2, receberao: 1, foraDaRegra: 1 });

    const { gerarLinkDeSenha, donoDoLink } = await import("@/lib/auth/recuperacao");
    const antigo = await gerarLinkDeSenha(ana.usuario.id, { id: A.id, slug: A.slug }, { id: dono.usuario.id, motivo: "teste" });
    const tokenDe = (url: string) => /#token=([^\s]+)/.exec(url)?.[1] ?? "";
    expect(await donoDoLink(tokenDe(antigo.url))).toBe(ana.usuario.id);

    const lote = await reenvio.criarLoteDeReenvio({ criadorId: A.id, ator, publico });
    expect(lote.envioIds).toHaveLength(1);
    expect(await envio.processarEnvio(lote.envioIds[0], 1, 5, semTeto)).toEqual({ r: "enviado" });
    const [msg] = falso.para(ana.usuario.email);
    expect(msg.tipo).toBe("PRIMEIRO_ACESSO");
    const novo = tokenDe(msg.texto);
    expect(novo).not.toBe(tokenDe(antigo.url));
    expect(await donoDoLink(novo)).toBe(ana.usuario.id);
    expect(await donoDoLink(tokenDe(antigo.url))).toBeNull();
    expect(falso.para(emDuas.usuario.email)).toHaveLength(0);
    expect(falso.para(fora.usuario.email)).toHaveLength(0);

    // Outro lote = outro link (o anterior deixa de valer).
    const lote2 = await reenvio.criarLoteDeReenvio({ criadorId: A.id, ator, publico });
    await envio.processarEnvio(lote2.envioIds[0], 1, 5, semTeto);
    expect(await donoDoLink(novo)).toBeNull();
    // A pessoa ganhou vínculo em outra área entre o lote e o envio: a regra recusa na hora do envio.
    const lote3 = await reenvio.criarLoteDeReenvio({ criadorId: A.id, ator, publico });
    await vincular(B.id, ana.usuario.id, "ALUNO");
    expect(await envio.processarEnvio(lote3.envioIds[0], 1, 5, semTeto)).toMatchObject({ r: "ignorado" });
  });
});

describe("permissões das actions", () => {
  it("ALUNO recebe 'Sem permissão'; ADMIN cria, conta e envia teste para o próprio e-mail", async () => {
    const falso = provedorFalso();
    const A = await novoCriador();
    const aluno = await membroCom(A.id);
    const admin = await membroCom(A.id, "ADMIN");
    const SEM = { ok: false, erro: "Sem permissão para esta ação." };
    const publico = { grupoIds: [], tagIds: [], produtoIds: [], nuncaAcessou: false };
    req.h = await cabecalhosLogados(aluno.usuario.email, A.slug);
    expect(await acoesCamp.acaoCriarCampanha({ nome: "X", conteudo: conteudo(), publico })).toEqual(SEM);
    expect(await acoesCamp.acaoReenviarPrimeiroAcesso({ publico })).toEqual(SEM);
    expect(await acoesCamp.acaoContarPublico({ publico })).toEqual(SEM);
    expect(await acoesAuto.acaoCriarAutomacao({ nome: "X", gatilho: "MEMBRO_CADASTRADO", conteudo: conteudo() })).toEqual(SEM);

    req.h = await cabecalhosLogados(admin.usuario.email, A.slug);
    const c = await acoesCamp.acaoCriarCampanha({ nome: "Boas-vindas", conteudo: conteudo(), publico });
    expect(c.ok).toBe(true);
    expect(await acoesCamp.acaoContarPublico({ publico })).toEqual({ ok: true, dados: { total: 1, descadastrados: 0, receberao: 1 } });
    expect(await acoesCamp.acaoCriarCampanha({ nome: "X", conteudo: conteudo({ corpo: "veja http://exemplo.com" }), publico })).toMatchObject({ ok: false });
    expect(await acoesCamp.acaoEnviarTesteEmail({ conteudo: conteudo() })).toEqual({ ok: true, dados: { para: admin.usuario.email } });
    expect(falso.para(admin.usuario.email)[0].assunto).toBe("[Teste] Novidade na área");
    const au = await acoesAuto.acaoCriarAutomacao({ nome: "Boas-vindas", gatilho: "MEMBRO_CADASTRADO", conteudo: conteudo() });
    expect(au.ok).toBe(true);
    // Sem provedor configurado, enviar é recusado com mensagem.
    falso.ligado = false;
    if (!c.ok) throw new Error();
    expect(await acoesCamp.acaoAgendarCampanha({ campanhaId: c.dados.id, versao: c.dados.versao, quando: null })).toEqual({ ok: false, erro: "E-mail não configurado nesta plataforma." });
    falso.ligado = true;
    expect(await acoesCamp.acaoAgendarCampanha({ campanhaId: c.dados.id, versao: c.dados.versao, quando: null })).toMatchObject({ ok: true });
  });
});
