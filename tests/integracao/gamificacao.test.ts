/**
 * Gamificação (ADR-0012, RN-144 a RN-147) no PostgreSQL real: concessão idempotente (reprocessar não
 * dá ponto duas vezes), só ALUNO e só com a gamificação ligada, 1ª publicação do dia, ajuste manual
 * com trilha (negativo só no ajuste: CHECK), ranking por período pelo `ocorrido_em` e saída do
 * ranking, desafios com progresso calculado na janela e bônus único, recálculo retroativo
 * idempotente e isolamento A × B (consulta e FK composta).
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { novoCriador } from "./_apoio";
import { canal, grupoCom } from "./_comunidade";
import { desafio, ligarGamificacao, pessoa, quemE, type Pessoa } from "./_engajamento";
import { avaliacaoPronta } from "./_passo7";
import { cursoPronto, matricular } from "./_progresso";

let pts: typeof import("@/lib/gamificacao/pontos");
let rk: typeof import("@/lib/gamificacao/ranking");
let des: typeof import("@/lib/gamificacao/desafios");
let rec: typeof import("@/lib/gamificacao/recalcular");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  pts = await import("@/lib/gamificacao/pontos");
  rk = await import("@/lib/gamificacao/ranking");
  des = await import("@/lib/gamificacao/desafios");
  rec = await import("@/lib/gamificacao/recalcular");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const DIA = 86_400_000;
const atras = (dias: number) => new Date(Date.now() - dias * DIA);

async function cenario(ligada = true) {
  const cr = await novoCriador();
  const dono = await pessoa(cr.id, "DONO");
  const ana = await pessoa(cr.id);
  const bia = await pessoa(cr.id);
  if (ligada) await ligarGamificacao(cr.id, dono.usuario.id);
  const curso = await cursoPronto(cr.id, { aulas: 3 });
  return { cr, dono, ana, bia, curso };
}

const razao = (membroId: string) => db.select().from(s.criadores_membros_pontos).where(eq(s.criadores_membros_pontos.membro_id, membroId));
const saldo = async (membroId: string) => (await razao(membroId)).reduce((t, l) => t + l.pontos, 0);

/** Aula concluída direto no banco (o caminho do player é provado em progresso.test.ts). */
async function concluiu(criadorId: string, p: Pessoa, aulaId: string, quando: Date) {
  await db.insert(s.produtos_modulos_aulas_progressos).values({
    criador_id: criadorId, membro_id: p.membro.id, aula_id: aulaId, segundos_bitmap: "1".repeat(100), segundos_assistidos: 100, percentual: 100,
    concluida: true, concluida_em: quando, concluida_por: "ASSISTIU", modified_by: p.usuario.id,
  });
}

async function publicou(criadorId: string, canalId: string, p: Pessoa, quando: Date) {
  await db.insert(s.criadores_canais_posts).values({ criador_id: criadorId, canal_id: canalId, autor_membro_id: p.membro.id, texto: "Oi", created_at: quando, updated_at: quando, modified_by: p.usuario.id });
}

describe("concessão", () => {
  it("idempotente, só ALUNO, só ligada, valor da configuração; publicação = 1ª do dia", async () => {
    const { cr, dono, ana, curso } = await cenario(false);
    const aula = { motivo: "AULA_CONCLUIDA" as const, aulaId: curso.aulas[0].id };
    expect(await pts.concederPontos(db, { criadorId: cr.id, membroId: ana.membro.id, conquista: aula })).toBe(0); // desligada
    await ligarGamificacao(cr.id, dono.usuario.id, { pontos_aula_concluida: 15 });
    expect(await pts.concederPontos(db, { criadorId: cr.id, membroId: ana.membro.id, conquista: aula })).toBe(15);
    expect(await pts.concederPontos(db, { criadorId: cr.id, membroId: ana.membro.id, conquista: aula })).toBe(0);
    expect(await pts.concederPontos(db, { criadorId: cr.id, membroId: dono.membro.id, conquista: aula })).toBe(0); // equipe não pontua

    const pub = { motivo: "PUBLICACAO_COMUNIDADE" as const };
    expect(await pts.concederPontos(db, { criadorId: cr.id, membroId: ana.membro.id, conquista: pub })).toBe(2);
    expect(await pts.concederPontos(db, { criadorId: cr.id, membroId: ana.membro.id, conquista: pub })).toBe(0);
    expect(await pts.concederPontos(db, { criadorId: cr.id, membroId: ana.membro.id, conquista: pub, ocorridoEm: atras(1) })).toBe(2);
    // Duas concessões simultâneas do mesmo fato: uma só vale.
    const curs = { motivo: "CURSO_CONCLUIDO" as const, produtoId: curso.produto.id };
    const r = await Promise.all([1, 2, 3].map(() => pts.concederPontos(db, { criadorId: cr.id, membroId: ana.membro.id, conquista: curs })));
    expect(r.sort()).toEqual([0, 0, 100]);
    expect(await saldo(ana.membro.id)).toBe(15 + 2 + 2 + 100);
  });

  it("ajuste manual: negativo permitido com justificativa e trilha; só aluno; CHECK recusa negativo automático", async () => {
    const { cr, dono, ana } = await cenario();
    const id = await db.transaction((tx) => pts.ajustarPontos(tx, { criadorId: cr.id, membroId: ana.membro.id, pontos: -20, justificativa: "Pontos lançados em dobro", autorUsuarioId: dono.usuario.id }));
    const [l] = await razao(ana.membro.id);
    expect(l).toMatchObject({ id, motivo: "AJUSTE_MANUAL", pontos: -20, justificativa: "Pontos lançados em dobro", modified_by: dono.usuario.id });
    const trilha = await db.select().from(s.auditoria).where(and(eq(s.auditoria.registro_id, id), eq(s.auditoria.tabela, "criadores_membros_pontos")));
    expect(trilha).toHaveLength(1);
    await expect(db.transaction((tx) => pts.ajustarPontos(tx, { criadorId: cr.id, membroId: dono.membro.id, pontos: 5, justificativa: "Bônus da equipe", autorUsuarioId: dono.usuario.id }))).rejects.toThrow("Aluno não encontrado");
    await expect(db.transaction((tx) => pts.ajustarPontos(tx, { criadorId: cr.id, membroId: ana.membro.id, pontos: 5, justificativa: "ok", autorUsuarioId: dono.usuario.id }))).rejects.toThrow("Explique o ajuste");
    const cru = { criador_id: cr.id, membro_id: ana.membro.id, referencia: randomUUID(), ocorrido_em: new Date(), modified_by: dono.usuario.id };
    await expect(db.insert(s.criadores_membros_pontos).values({ ...cru, motivo: "AULA_CONCLUIDA", pontos: -5 })).rejects.toThrow();
    await expect(db.insert(s.criadores_membros_pontos).values({ ...cru, motivo: "AJUSTE_MANUAL", pontos: 5 })).rejects.toThrow(); // sem justificativa
  });
});

describe("ranking e resumo", () => {
  it("período pelo ocorrido_em, empate na posição, saída do ranking e nível", async () => {
    const { cr, ana, bia, curso } = await cenario();
    const caio = await pessoa(cr.id);
    const dar = (p: Pessoa, aulaId: string, quando = new Date()) => pts.concederPontos(db, { criadorId: cr.id, membroId: p.membro.id, conquista: { motivo: "AULA_CONCLUIDA", aulaId }, ocorridoEm: quando });
    await dar(ana, curso.aulas[0].id);
    await pts.concederPontos(db, { criadorId: cr.id, membroId: ana.membro.id, conquista: { motivo: "CURSO_CONCLUIDO", produtoId: curso.produto.id }, ocorridoEm: atras(40) });
    await dar(bia, curso.aulas[0].id);
    await dar(bia, curso.aulas[1].id);
    await dar(caio, curso.aulas[0].id);
    await dar(caio, curso.aulas[1].id);
    await dar(caio, curso.aulas[2].id);
    await db.update(s.usuarios).set({ aparecer_no_ranking: false }).where(eq(s.usuarios.id, caio.usuario.id));
    const agora = new Date();

    expect((await rk.rankingDoCriador(cr.id, "semana", agora)).map((l) => [l.membroId, l.pontos, l.posicao])).toEqual([
      [bia.membro.id, 20, 1],
      [ana.membro.id, 10, 2],
    ]);
    expect((await rk.rankingDoCriador(cr.id, "total", agora)).map((l) => [l.membroId, l.pontos, l.posicao])).toEqual([
      [ana.membro.id, 110, 1],
      [bia.membro.id, 20, 2],
    ]);
    const r = await rk.resumoDoMembro(cr.id, ana.membro.id, agora);
    expect(r).toMatchObject({ total: 110, semana: 10, posicao: { semana: 2, total: 1 }, aparecerNoRanking: true });
    expect(r.nivel.atual.nome).toBe("Aprendiz");
    expect(await rk.resumoDoMembro(cr.id, caio.membro.id, agora)).toMatchObject({ total: 30, posicao: { semana: null, mes: null, total: null }, aparecerNoRanking: false });
    expect((await rk.extratoDoMembro(cr.id, ana.membro.id)).map((l) => l.motivo)).toEqual(["AULA_CONCLUIDA", "CURSO_CONCLUIDO"]);
  });
});

describe("desafios", () => {
  it("progresso só na janela, conclusão com bônus único; grupo e encerrado", async () => {
    const { cr, dono, ana, bia, curso } = await cenario();
    const d = await desafio(cr.id, dono.usuario.id, { recompensa: "Mentoria individual de 30 min" });
    const qa = quemE(cr.id, ana);
    await concluiu(cr.id, ana, curso.aulas[0].id, atras(3)); // antes do início: não conta
    expect(await des.participarDoDesafio(qa, d.id, new Date())).toBe(true);
    expect(await des.participarDoDesafio(qa, d.id, new Date())).toBe(false);
    await concluiu(cr.id, ana, curso.aulas[1].id, new Date());
    expect((await des.desafiosDoMembro(qa, new Date()))[0]).toMatchObject({ id: d.id, momento: "ATIVO", meta: 2, atual: 1, participando: true, concluidoEm: null });

    await concluiu(cr.id, ana, curso.aulas[2].id, new Date());
    await pts.registrarConquista({ criadorId: cr.id, membroId: ana.membro.id, conquista: { motivo: "AULA_CONCLUIDA", aulaId: curso.aulas[2].id } });
    await pts.registrarConquista({ criadorId: cr.id, membroId: ana.membro.id, conquista: { motivo: "AULA_CONCLUIDA", aulaId: curso.aulas[2].id } });
    const [feito] = await des.desafiosDoMembro(qa, new Date());
    expect(feito).toMatchObject({ atual: 2, recompensa: "Mentoria individual de 30 min" });
    expect(feito.concluidoEm).not.toBeNull();
    const bonus = (await razao(ana.membro.id)).filter((l) => l.motivo === "DESAFIO_CONCLUIDO");
    expect(bonus.map((l) => [l.referencia, l.pontos])).toEqual([[d.id, 50]]);

    // Público GRUPOS: bia fora do grupo não vê nem participa; ENCERRADO não conclui ninguém.
    const g = await grupoCom(cr.id, [ana.membro.id]);
    const dg = await desafio(cr.id, dono.usuario.id, { publico: "GRUPOS", meta_tipo: "PUBLICACOES_COMUNIDADE", meta_quantidade: 1 });
    await db.insert(s.criadores_desafios_grupos).values({ criador_id: cr.id, desafio_id: dg.id, grupo_id: g.id, modified_by: dono.usuario.id });
    expect((await des.desafiosDoMembro(quemE(cr.id, bia), new Date())).map((x) => x.id)).toEqual([d.id]);
    await expect(des.participarDoDesafio(quemE(cr.id, bia), dg.id, new Date())).rejects.toThrow(des.MSG_DESAFIO_INDISPONIVEL);
    await des.participarDoDesafio(qa, dg.id, new Date());
    await db.update(s.criadores_desafios).set({ situacao: "ENCERRADO" }).where(eq(s.criadores_desafios.id, dg.id));
    await publicou(cr.id, (await canal(cr.id)).id, ana, new Date());
    expect(await des.concluirDesafiosCumpridos(db, cr.id, ana.membro.id, new Date())).toBe(0);
  });
});

describe("recálculo retroativo", () => {
  it("gera os lançamentos dos fatos existentes com a data do fato; rodar de novo não muda nada", async () => {
    const { cr, dono, ana, bia, curso } = await cenario();
    await concluiu(cr.id, ana, curso.aulas[0].id, atras(10));
    await concluiu(cr.id, ana, curso.aulas[1].id, atras(2));
    const m = await matricular(cr.id, ana.membro.id, curso.produto.id);
    await db.update(s.produtos_matriculas).set({ concluida_em: atras(2) }).where(eq(s.produtos_matriculas.id, m.id));
    const av = await avaliacaoPronta(cr.id, curso.produto.id);
    for (const [n, aprovada] of [[1, false], [2, true], [3, true]] as const) {
      await db.insert(s.produtos_avaliacoes_tentativas).values({
        criador_id: cr.id, avaliacao_id: av.avaliacao.id, membro_id: bia.membro.id, numero: n, finalizada_em: atras(5 - n), finalizada_por: "ALUNO",
        ordem: [], nota: aprovada ? 90 : 10, aprovada, correcao: [], modified_by: bia.usuario.id,
      });
    }
    const c = await canal(cr.id);
    await publicou(cr.id, c.id, bia, atras(1));
    await publicou(cr.id, c.id, bia, new Date(atras(1).getTime() + 1000));
    await publicou(cr.id, c.id, bia, atras(3));
    await publicou(cr.id, c.id, dono, atras(1)); // equipe não pontua
    // Desafio cumprido antes de existir gamificação... mas ana participa.
    const d = await desafio(cr.id, dono.usuario.id, { inicio_em: atras(4), meta_quantidade: 1 });
    await db.insert(s.criadores_desafios_participacoes).values({ criador_id: cr.id, desafio_id: d.id, membro_id: ana.membro.id, modified_by: ana.usuario.id });

    const r1 = await rec.recalcularPontos(cr.id);
    expect(r1).toEqual({ AULA_CONCLUIDA: 2, CURSO_CONCLUIDO: 1, AVALIACAO_APROVADA: 1, PUBLICACAO_COMUNIDADE: 2, DESAFIO_CONCLUIDO: 0, desafiosConcluidos: 1 });
    expect(await saldo(ana.membro.id)).toBe(10 + 10 + 100 + 50);
    expect(await saldo(bia.membro.id)).toBe(30 + 2 + 2);
    const aprov = (await razao(bia.membro.id)).find((l) => l.motivo === "AVALIACAO_APROVADA")!;
    expect(Math.round((Date.now() - aprov.ocorrido_em.getTime()) / DIA)).toBe(3); // data da 1ª aprovação (n=2), não a de hoje

    const r2 = await rec.recalcularPontos(cr.id);
    expect(Object.values(r2).every((v) => v === 0)).toBe(true);
  });
});

describe("isolamento A × B", () => {
  it("ranking de A não mostra B; o banco recusa lançamento de membro de B em A", async () => {
    const A = await cenario();
    const B = await cenario();
    await pts.concederPontos(db, { criadorId: B.cr.id, membroId: B.ana.membro.id, conquista: { motivo: "AULA_CONCLUIDA", aulaId: B.curso.aulas[0].id } });
    // Criador A com membro de B: a consulta não acha o vínculo e não concede.
    expect(await pts.concederPontos(db, { criadorId: A.cr.id, membroId: B.ana.membro.id, conquista: { motivo: "AULA_CONCLUIDA", aulaId: A.curso.aulas[0].id } })).toBe(0);
    expect(await rk.rankingDoCriador(A.cr.id, "total", new Date())).toEqual([]);
    expect((await rk.resumoDoMembro(A.cr.id, B.ana.membro.id, new Date())).total).toBe(0);
    await expect(
      db.insert(s.criadores_membros_pontos).values({ criador_id: A.cr.id, membro_id: B.ana.membro.id, motivo: "AULA_CONCLUIDA", pontos: 10, referencia: randomUUID(), ocorrido_em: new Date(), modified_by: B.ana.usuario.id }),
    ).rejects.toThrow();
    await expect(des.participarDoDesafio(quemE(A.cr.id, A.ana), (await desafio(B.cr.id, B.dono.usuario.id)).id, new Date())).rejects.toThrow(des.MSG_DESAFIO_INDISPONIVEL);
  });
});
