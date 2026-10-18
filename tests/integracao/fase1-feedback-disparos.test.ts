/**
 * Fase 1 (ADR-0018) no PostgreSQL real — feedback de conteúdo (RN-202), registro de disparos de
 * e-mail (RN-203) e as consultas das abas novas (RN-205): Matrículas › Progresso/Avaliações/
 * Tentativas extras, Aluno › Anotações/Turmas e Estúdio › Estatísticas. Isolamento A×B em tudo.
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { novoCriador, novoUsuario } from "./_apoio";
import { avaliacaoPronta, concluirAulas, respostasMetade } from "./_passo7";
import { alunoMatriculado, cursoPronto, membroCom, quem } from "./_progresso";

let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;
let fbServ: typeof import("@/lib/feedbacks/servico");
let fbCons: typeof import("@/lib/feedbacks/consultas");
let disparos: typeof import("@/lib/email/disparos");
let enviar: typeof import("@/lib/email/enviar");
let abas: typeof import("@/lib/matriculas/abas");
let continuar: typeof import("@/lib/progresso/continuar");
let estat: typeof import("@/lib/video/estatisticas");
let tent: typeof import("@/lib/avaliacoes/tentativas");

beforeAll(async () => {
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
  fbServ = await import("@/lib/feedbacks/servico");
  fbCons = await import("@/lib/feedbacks/consultas");
  disparos = await import("@/lib/email/disparos");
  enviar = await import("@/lib/email/enviar");
  abas = await import("@/lib/matriculas/abas");
  continuar = await import("@/lib/progresso/continuar");
  estat = await import("@/lib/video/estatisticas");
  tent = await import("@/lib/avaliacoes/tentativas");
});

const quemAvalia = (criadorId: string, p: { usuario: { id: string }; membro: { id: string; papel: "DONO" | "ADMIN" | "ALUNO" } }) => ({
  criadorId,
  membroId: p.membro.id,
  usuarioId: p.usuario.id,
  papel: p.membro.papel,
});

describe("feedback de conteúdo", () => {
  it("um por aluno por aula (muda a mesma linha), só ALUNO com acesso, trilha, resumo e isolamento", async () => {
    const A = await novoCriador();
    const B = await novoCriador();
    const { produto, aulas } = await cursoPronto(A.id, { aulas: 2 });
    const ana = await alunoMatriculado(A.id, produto.id);
    const beto = await alunoMatriculado(A.id, produto.id);
    const semMatricula = await membroCom(A.id);
    const admin = await membroCom(A.id, "ADMIN");
    const deB = await membroCom(B.id);

    const f1 = await fbServ.darFeedback(quemAvalia(A.id, ana), { aulaId: aulas[0].id, util: true, comentario: "Muito boa" });
    const f2 = await fbServ.darFeedback(quemAvalia(A.id, ana), { aulaId: aulas[0].id, util: false, comentario: null });
    expect(f2.id).toBe(f1.id);
    await fbServ.darFeedback(quemAvalia(A.id, beto), { aulaId: aulas[0].id, util: true, comentario: "<b>texto puro</b>" });
    expect(await fbCons.meuFeedback(A.id, ana.membro.id, aulas[0].id)).toMatchObject({ util: false, comentario: null });

    await expect(fbServ.darFeedback(quemAvalia(A.id, semMatricula), { aulaId: aulas[0].id, util: true, comentario: null })).rejects.toThrow(/Sem permissão/);
    await expect(fbServ.darFeedback(quemAvalia(A.id, admin), { aulaId: aulas[0].id, util: true, comentario: null })).rejects.toThrow(/Só alunos/);
    // Aula de A pedida no host de B: não existe lá.
    await expect(fbServ.darFeedback(quemAvalia(B.id, deB), { aulaId: aulas[0].id, util: true, comentario: null })).rejects.toThrow("Aula não encontrada");

    const resumo = await fbCons.resumoFeedbackPorAula(A.id);
    expect(resumo).toEqual([expect.objectContaining({ aulaId: aulas[0].id, avaliacoes: 2, uteis: 1, percentualUtil: 50, comentarios: 1 })]);
    const lista = await fbCons.feedbacksDoCriador(A.id, { soComComentario: true, pagina: 1, porPagina: 10 });
    expect(lista.total).toBe(1);
    expect(lista.linhas[0]).toMatchObject({ comentario: "<b>texto puro</b>", nome: expect.any(String), produtoId: produto.id });
    expect((await fbCons.feedbacksDoCriador(A.id, { util: false, pagina: 1, porPagina: 10 })).total).toBe(1);
    expect((await fbCons.feedbacksDoCriador(B.id, { pagina: 1, porPagina: 10 })).total).toBe(0);
    // O banco recusa comentário vazio e vínculo de outro criador.
    await expect(db.insert(s.produtos_modulos_aulas_feedbacks).values({ criador_id: A.id, aula_id: aulas[1].id, membro_id: deB.membro.id, util: true, modified_by: deB.usuario.id })).rejects.toThrow();

    expect(await fbServ.removerFeedback(quemAvalia(A.id, ana), aulas[0].id)).toBe(true);
    expect(await fbServ.removerFeedback(quemAvalia(A.id, ana), aulas[0].id)).toBe(false);
    expect(await fbCons.meuFeedback(A.id, ana.membro.id, aulas[0].id)).toBeNull();
    const trilha = await db.select().from(s.auditoria).where(eq(s.auditoria.registro_id, f1.id));
    expect(trilha.map((t) => t.acao).sort()).toEqual(["atualizar", "criar", "excluir"]);
  });
});

describe("disparos de e-mail", () => {
  it("sem SMTP registra NAO_CONFIGURADO sem o endereço em claro; busca exata pelo HMAC; append-only", async () => {
    const A = await novoCriador();
    const B = await novoCriador();
    const para = `Pessoa.${Date.now()}@Exemplo.com`;
    const ok = await enviar.enviarEmail({ para, tipo: "PRIMEIRO_ACESSO", criadorId: A.id, remetente: "Área", assunto: "Seu acesso", html: "<p>token</p>", texto: "token=segredo" });
    expect(ok).toBe(false);
    await disparos.registrarDisparo({ criadorId: A.id, tipo: "DEFINIR_SENHA", para: "outra@exemplo.com", assunto: "Senha", situacao: "FALHOU", erro: "EAUTH" });
    const todos = await disparos.listarDisparos(A.id, { pagina: 1, porPagina: 10 });
    expect(todos.total).toBe(2);
    const doPara = await disparos.listarDisparos(A.id, { email: para.toLowerCase(), pagina: 1, porPagina: 10 });
    expect(doPara.linhas).toEqual([expect.objectContaining({ tipo: "PRIMEIRO_ACESSO", situacao: "NAO_CONFIGURADO", destinatario: "pe***@ex***.com", assunto: "Seu acesso" })]);
    expect((await disparos.listarDisparos(A.id, { email: "pessoa", pagina: 1, porPagina: 10 })).total).toBe(0);
    expect((await disparos.listarDisparos(B.id, { pagina: 1, porPagina: 10 })).total).toBe(0);
    expect(await disparos.resumoDisparos(A.id)).toEqual({ ENVIADO: 0, FALHOU: 1, NAO_CONFIGURADO: 1 });
    // Nada do corpo nem do endereço em claro em lugar nenhum da linha.
    const [linha] = await db.select().from(s.emails_disparos).where(eq(s.emails_disparos.destinatario_hash, disparos.hashDoDestinatario(para)));
    expect(JSON.stringify(linha)).not.toMatch(/token|segredo|Pessoa\./i);
    expect(linha).not.toHaveProperty("updated_at");
    expect(linha).not.toHaveProperty("is_deleted");
  });
});

describe("abas novas (só consultas)", () => {
  it("Matrículas › Progresso, Avaliações e Tentativas extras; Aluno › Anotações e Turmas; Estúdio › Estatísticas", async () => {
    const A = await novoCriador();
    const B = await novoCriador();
    const dono = await novoUsuario();
    const { produto, modulo, aulas } = await cursoPronto(A.id, { aulas: 2, duracao: 120 });
    const ana = await alunoMatriculado(A.id, produto.id);
    await concluirAulas(A.id, ana, [aulas[0]]);

    const prog = await abas.progressoDasMatriculas(A.id, { pagina: 1, porPagina: 10 });
    expect(prog.linhas).toEqual([expect.objectContaining({ membroId: ana.membro.id, totalAulas: 2, concluidas: 1, percentual: 50, concluidaEm: null })]);
    expect((await abas.progressoDasMatriculas(B.id, { pagina: 1, porPagina: 10 })).total).toBe(0);

    // Avaliação de 1 tentativa reprovada → aparece em "esgotaram sem aprovar"; concessão some com a fila.
    const { avaliacao, questoes } = await avaliacaoPronta(A.id, produto.id, { tentativasMax: 1 });
    const q = { criadorId: A.id, membroId: ana.membro.id, usuarioId: ana.usuario.id, papel: "ALUNO" as const };
    const { tentativaId } = await tent.iniciarTentativa(q, avaliacao.id);
    for (const r of respostasMetade(questoes)) await tent.responder(q, { tentativaId, ...r });
    await tent.finalizarTentativa(q, tentativaId, "ALUNO");
    const t = await abas.tentativasDoCriador(A.id, { aprovada: false, pagina: 1, porPagina: 10 });
    expect(t.linhas).toEqual([expect.objectContaining({ tentativaId, nota: 50, aprovada: false, emAndamento: false, avaliacaoId: avaliacao.id })]);
    expect(await abas.esgotaramSemAprovar(A.id)).toEqual([expect.objectContaining({ membroId: ana.membro.id, avaliacaoId: avaliacao.id, finalizadas: 1, extras: 0, melhorNota: 50 })]);
    await tent.concederTentativa({ criadorId: A.id, autorId: dono.id, avaliacaoId: avaliacao.id, membroId: ana.membro.id, quantidade: 1, motivo: "Nova chance" });
    expect(await abas.esgotaramSemAprovar(A.id)).toEqual([]);
    expect((await abas.concessoesDoCriador(A.id, { pagina: 1, porPagina: 10 })).linhas).toEqual([expect.objectContaining({ quantidade: 1, motivo: "Nova chance" })]);
    expect((await abas.tentativasDoCriador(B.id, { pagina: 1, porPagina: 10 })).total).toBe(0);

    // Anotações e turmas: só as da própria pessoa.
    await db.insert(s.produtos_modulos_aulas_anotacoes).values({ criador_id: A.id, membro_id: ana.membro.id, aula_id: aulas[1].id, tempo_seg: 30, texto: "Rever isto", modified_by: ana.usuario.id });
    const beto = await alunoMatriculado(A.id, produto.id);
    expect(await continuar.anotacoesDoAluno(quem(A.id, ana))).toEqual([expect.objectContaining({ texto: "Rever isto", tempoSeg: 30, aulaId: aulas[1].id, produtoSlug: produto.slug })]);
    expect(await continuar.anotacoesDoAluno(quem(A.id, beto))).toEqual([]);
    const [g] = await db.insert(s.criadores_grupos).values({ criador_id: A.id, nome: "Turma 1", modified_by: dono.id }).returning();
    await db.insert(s.criadores_grupos_membros).values([ana, beto].map((p) => ({ criador_id: A.id, grupo_id: g.id, membro_id: p.membro.id, modified_by: dono.id })));
    expect(await continuar.turmasDoAluno(quem(A.id, ana))).toEqual([expect.objectContaining({ id: g.id, nome: "Turma 1", tipo: "TURMA", membros: 2 })]);
    expect(await continuar.turmasDoAluno({ ...quem(A.id, ana), membro: { id: null, papel: "DONO" } })).toEqual([]);

    // Estatísticas: só vídeo PRONTO; visualizações do período, minutos únicos, retenção média.
    const [video] = await db
      .insert(s.produtos_modulos_aulas_videos)
      .values({ criador_id: A.id, aula_id: aulas[0].id, situacao: "PRONTO", nome_original: "a.mp4", mime: "video/mp4", tamanho_bytes: 10, chave_origem: `criadores/${A.id}/videos/${aulas[0].id}/original.mp4`, chave_cifrada: "v1:x", duracao_seg: 120, modified_by: dono.id })
      .returning();
    const hoje = new Date().toISOString().slice(0, 10);
    await db.insert(s.produtos_modulos_aulas_visualizacoes).values({ criador_id: A.id, aula_id: aulas[0].id, dia: hoje, visualizacoes: 3, modified_by: dono.id }).onConflictDoNothing();
    const e = await estat.estatisticasDosVideos(A.id);
    const doVideo = e.find((x) => x.videoId === video.id);
    expect(doVideo).toMatchObject({ aulaId: aulas[0].id, espectadores: 1, conclusoes: 1, retencaoMedia: expect.any(Number) });
    expect(doVideo!.visualizacoes).toBeGreaterThanOrEqual(3);
    expect(await estat.estatisticasDosVideos(B.id)).toEqual([]);
    void modulo;
  });
});
