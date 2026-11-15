/**
 * Liberação "X dias depois da matrícula" (RN-274) no PostgreSQL REAL: a conta em TS e em SQL dá o
 * mesmo instante; cada aluno tem o seu calendário (acesso, página do curso, vitrine, busca do
 * assistente); a AULA_NOVA sai uma vez só e nunca antes do dia; a action recusa os dois modos
 * juntos e o número fora da faixa; a trilha registra o campo novo.
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador } from "./_apoio";
import { ok, versaoDe } from "./_catalogo";
import { notificacoesDe } from "./_comunidade";
import { cursoPronto, matricular, membroCom, quem } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let lib: typeof import("@/lib/video/liberacao");
let acesso: typeof import("@/lib/video/acesso-aula");
let curso: typeof import("@/lib/progresso/consultas-curso");
let vitrine: typeof import("@/lib/progresso/consultas");
let busca: typeof import("@/lib/conhecimento/busca");
let idx: typeof import("@/lib/conhecimento/indexar");
let ger: typeof import("@/lib/notificacoes/gerar");
let con: typeof import("@/lib/notificacoes/consultas");
let aulas: typeof import("@/lib/actions/aulas");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  lib = await import("@/lib/video/liberacao");
  acesso = await import("@/lib/video/acesso-aula");
  curso = await import("@/lib/progresso/consultas-curso");
  vitrine = await import("@/lib/progresso/consultas");
  busca = await import("@/lib/conhecimento/busca");
  idx = await import("@/lib/conhecimento/indexar");
  ger = await import("@/lib/notificacoes/gerar");
  con = await import("@/lib/notificacoes/consultas");
  aulas = await import("@/lib/actions/aulas");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

const DIA = 86_400_000;

/** Curso de 2 aulas; a 2ª libera 7 dias depois da matrícula. Ana matriculada hoje, Bia há 8 dias. */
async function cenario() {
  const cr = await novoCriador();
  const c = await cursoPronto(cr.id, { aulas: 2 });
  const aula = c.aulas[1];
  await db.update(s.produtos_modulos_aulas).set({ libera_apos_dias: 7 }).where(eq(s.produtos_modulos_aulas.id, aula.id));
  const ana = await membroCom(cr.id, "ALUNO");
  const bia = await membroCom(cr.id, "ALUNO");
  const dono = await membroCom(cr.id, "DONO");
  const agora = new Date();
  const mAna = await matricular(cr.id, ana.membro.id, c.produto.id);
  const mBia = await matricular(cr.id, bia.membro.id, c.produto.id);
  await db.update(s.produtos_matriculas).set({ iniciada_em: new Date(agora.getTime() - 8 * DIA) }).where(eq(s.produtos_matriculas.id, mBia.id));
  return { cr, c, aula, ana, bia, dono, agora, mAna };
}

describe("conta da liberação", () => {
  it("TS e SQL dão o mesmo instante (fuso de São Paulo, inclusive no antigo horário de verão)", async () => {
    const instantes = [
      "2026-11-10T18:00:00Z",
      "2026-11-11T02:30:00Z", // 23:30 de São Paulo
      "2026-11-11T03:00:00Z", // meia-noite exata
      "2026-12-31T23:59:59Z",
      "2019-02-15T14:00:00Z", // verão (-02)
      "2018-11-03T15:00:00Z", // véspera da meia-noite que não existiu
      "2024-02-29T12:00:00Z",
    ];
    for (const t of instantes) {
      for (const n of [1, 2, 7, 30, 365, 3650]) {
        const iniciada = new Date(t);
        const [r] = (await db.execute<{ em: string }>(sql`select ${lib.liberacaoPorMatriculaSql(sql`${iniciada.toISOString()}::timestamptz`, sql`${n}::int`)} as em`)).rows;
        expect(new Date(r.em), `${t} + ${n}`).toEqual(lib.liberacaoEfetiva({ liberaEm: null, liberaAposDias: n }, iniciada));
      }
    }
  });
});

describe("cada aluno com o seu calendário", () => {
  it("matriculado hoje não assiste a aula de 7 dias; há 8 dias assiste; equipe sempre", async () => {
    const x = await cenario();
    const ana = await acesso.acessoDaAula(x.cr.id, x.aula.id, { papel: "ALUNO", membroId: x.ana.membro.id }, x.agora);
    const bia = await acesso.acessoDaAula(x.cr.id, x.aula.id, { papel: "ALUNO", membroId: x.bia.membro.id }, x.agora);
    expect(ana).toMatchObject({ pode: false, motivo: "LIBERACAO" });
    expect(bia).toMatchObject({ pode: true, motivo: null });
    expect(await acesso.acessoDaAula(x.cr.id, x.aula.id, { papel: "DONO", membroId: x.dono.membro.id }, x.agora)).toMatchObject({ pode: true });
    // A 1ª aula (sem modo) abre para as duas.
    expect(await acesso.acessoDaAula(x.cr.id, x.c.aulas[0].id, { papel: "ALUNO", membroId: x.ana.membro.id }, x.agora)).toMatchObject({ pode: true });
  });

  it("página do curso: mesma aula bloqueada para uma e aberta para a outra, com a data DELA; total do progresso igual", async () => {
    const x = await cenario();
    const daAna = await curso.cursoDoAluno(quem(x.cr.id, x.ana), x.c.produto.slug, x.agora);
    const daBia = await curso.cursoDoAluno(quem(x.cr.id, x.bia), x.c.produto.slug, x.agora);
    const aulaAna = daAna!.modulos[0].aulas[1];
    expect(aulaAna).toMatchObject({ estado: "bloqueada", motivoBloqueio: "LIBERACAO" });
    expect(aulaAna.liberaEm).toEqual(lib.liberacaoEfetiva({ liberaEm: null, liberaAposDias: 7 }, x.mAna.iniciada_em));
    expect(daBia!.modulos[0].aulas[1]).toMatchObject({ motivoBloqueio: null });
    // A aula ainda travada CONTA no total (como a de data futura): o certificado espera a liberação.
    expect(daAna!.progresso.total).toBe(2);
    const player = await curso.aulaParaPlayer(quem(x.cr.id, x.ana), x.aula.id, x.agora);
    expect(player).toMatchObject({ pode: false, motivoBloqueio: "LIBERACAO", materiais: [] });
  });

  it("vitrine do aluno (fileira manual): a aula só aparece para quem já chegou no dia", async () => {
    const x = await cenario();
    const item = [{ tipo: "AULA" as const, id: x.aula.id }];
    expect(await vitrine.cartoesEscolhidos(quem(x.cr.id, x.ana), item, x.agora)).toEqual([]);
    expect((await vitrine.cartoesEscolhidos(quem(x.cr.id, x.bia), item, x.agora)).map((c) => c.id)).toEqual([x.aula.id]);
    expect((await vitrine.cartoesEscolhidos(quem(x.cr.id, x.dono), item, x.agora)).map((c) => c.id)).toEqual([x.aula.id]);
  });

  it("busca do assistente não traz trecho da aula ainda bloqueada para AQUELE aluno", async () => {
    const x = await cenario();
    await db.update(s.produtos_modulos_aulas).set({ descricao: "Aula de sete dias carambola sobre delegação." }).where(eq(s.produtos_modulos_aulas.id, x.aula.id));
    await idx.sincronizarAula(x.cr.id, x.aula.id, x.cr.id);
    const opcoes = { produtos: null, limite: 6, porDocumento: 3 };
    const texto = async (membroId: string) =>
      (await busca.recuperarTrechos(x.cr.id, { papel: "ALUNO", membroId }, "carambola", opcoes, x.agora)).map((t) => t.texto).join(" ");
    expect(await texto(x.ana.membro.id)).not.toMatch(/carambola/);
    expect(await texto(x.bia.membro.id)).toMatch(/carambola/);
  });

  it("matrícula reativada mantém o calendário (aula já liberada não volta a travar)", async () => {
    const x = await cenario();
    const servico = await import("@/lib/matriculas/servico");
    const daBia = and(eq(s.produtos_matriculas.membro_id, x.bia.membro.id), eq(s.produtos_matriculas.is_deleted, false));
    const [antes] = await db.select().from(s.produtos_matriculas).where(daBia);
    await db.update(s.produtos_matriculas).set({ expira_em: new Date(x.agora.getTime() - 1000) }).where(daBia);
    const r = await db.transaction((tx) =>
      servico.matricular(tx, { criadorId: x.cr.id, membroId: x.bia.membro.id, produtoId: x.c.produto.id, origem: "COMPRA", autor: null }),
    );
    expect(r.resultado).toBe("reativada");
    const [depois] = await db.select().from(s.produtos_matriculas).where(daBia);
    expect(depois.iniciada_em).toEqual(antes.iniciada_em);
    expect(await acesso.acessoDaAula(x.cr.id, x.aula.id, { papel: "ALUNO", membroId: x.bia.membro.id }, x.agora)).toMatchObject({ pode: true, motivo: null });
  });
});

describe("notificação de aula nova", () => {
  it("sai uma vez só e só quando libera para cada aluno", async () => {
    const x = await cenario();
    const aulaNova = async (membroId: string) => (await notificacoesDe(membroId)).filter((n) => n.tipo === "AULA_NOVA" && n.chave === `aula:${x.aula.id}`);
    await db.insert(s.produtos_modulos_aulas_videos).values({
      id: randomUUID(),
      criador_id: x.cr.id,
      aula_id: x.aula.id,
      situacao: "PRONTO",
      nome_original: "aula.mp4",
      mime: "video/mp4",
      tamanho_bytes: 10,
      chave_origem: `criadores/${x.cr.id}/videos/${randomUUID()}/original.mp4`,
      chave_cifrada: "x",
      modified_by: x.dono.usuario.id,
    });
    // Vídeo pronto: Bia (já no dia) recebe; Ana (falta uma semana) não.
    await ger.notificarAulaNova(x.cr.id, x.aula.id, x.dono.usuario.id, x.agora);
    expect(await aulaNova(x.bia.membro.id)).toHaveLength(1);
    expect(await aulaNova(x.ana.membro.id)).toHaveLength(0);
    // O sino da Ana antes do dia: nada.
    await con.contarNaoLidas(x.cr.id, x.ana.membro.id, new Date(x.agora.getTime() + 5 * DIA));
    expect(await aulaNova(x.ana.membro.id)).toHaveLength(0);
    // No dia: uma notificação, datada do dia em que liberou para ela; contar de novo não duplica.
    const libera = lib.liberacaoEfetiva({ liberaEm: null, liberaAposDias: 7 }, x.mAna.iniciada_em)!;
    const depois = new Date(libera.getTime() + 60_000);
    expect(await con.contarNaoLidas(x.cr.id, x.ana.membro.id, depois)).toBe(1);
    expect(await con.contarNaoLidas(x.cr.id, x.ana.membro.id, depois)).toBe(1);
    const [n] = await aulaNova(x.ana.membro.id);
    expect(n.evento_em).toEqual(libera);
    // Bia também passa pelo sino: continua uma só.
    await con.contarNaoLidas(x.cr.id, x.bia.membro.id, depois);
    expect(await aulaNova(x.bia.membro.id)).toHaveLength(1);
    // Vídeo trocado (PRONTO de novo) não notifica de novo.
    await ger.notificarAulaNova(x.cr.id, x.aula.id, x.dono.usuario.id, depois);
    expect(await aulaNova(x.ana.membro.id)).toHaveLength(1);
  });
});

describe("edição da aula", () => {
  it("action: um modo só, faixa 1..3650, zera o outro modo e a trilha registra o campo", async () => {
    const x = await cenario();
    req.h = await cabecalhosLogados(x.dono.usuario.email, x.cr.slug);
    const a = x.c.aulas[0].id;
    const salvar = async (extra: Record<string, unknown>) =>
      aulas.acaoSalvarAula({ aulaId: a, versao: await versaoDe(s.produtos_modulos_aulas, a), titulo: "Aula 1", descricao: "", liberaEm: null, preRequisitoAulaId: null, capitulos: [], ...extra });
    const linha = async () => (await db.select().from(s.produtos_modulos_aulas).where(eq(s.produtos_modulos_aulas.id, a)))[0];

    expect(await salvar({ liberaEm: "2026-12-01T12:00:00.000Z", liberaAposDias: 7 })).toMatchObject({ ok: false, erro: expect.stringMatching(/um modo/) });
    expect(await salvar({ liberaAposDias: 0 })).toMatchObject({ ok: false, erro: expect.stringMatching(/1 a 3650/) });
    expect(await salvar({ liberaAposDias: 3651 })).toMatchObject({ ok: false, erro: expect.stringMatching(/1 a 3650/) });
    expect(await salvar({ liberaAposDias: 2.5 })).toMatchObject({ ok: false });

    ok(await salvar({ liberaEm: "2026-12-01T12:00:00.000Z" }));
    expect(await linha()).toMatchObject({ libera_em: new Date("2026-12-01T12:00:00.000Z"), libera_apos_dias: null });
    ok(await salvar({ liberaAposDias: 7 }));
    expect(await linha()).toMatchObject({ libera_em: null, libera_apos_dias: 7 });

    const trilha = await db
      .select()
      .from(s.auditoria)
      .where(and(eq(s.auditoria.tabela, "produtos_modulos_aulas"), eq(s.auditoria.registro_id, a), eq(s.auditoria.user_id, x.dono.usuario.id)));
    const ultima = trilha.find((t) => (t.dados_novos as Record<string, unknown> | null)?.libera_apos_dias === 7);
    expect(ultima?.dados_anteriores).toMatchObject({ libera_apos_dias: null });
    expect(ultima?.detalhes).toMatch(/libera_apos_dias/);

    // Banco também recusa os dois juntos e o número fora da faixa (CHECK).
    await expect(db.update(s.produtos_modulos_aulas).set({ libera_em: new Date() }).where(eq(s.produtos_modulos_aulas.id, a))).rejects.toThrow();
    await expect(db.update(s.produtos_modulos_aulas).set({ libera_em: null, libera_apos_dias: 0 }).where(eq(s.produtos_modulos_aulas.id, a))).rejects.toThrow();
  });
});
