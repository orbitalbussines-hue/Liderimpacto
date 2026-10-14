/**
 * Progresso do player (RN-118, ADR-0006) no PostgreSQL real: upsert de uma instrução (bits por
 * segundo), teto de segundos por tempo real ("pular para o fim não conclui"), 90% conclui e nunca
 * desconclui, retomar, corrida de batidas simultâneas, visualizações do Top 10, conclusão manual,
 * matrícula concluída, pré-requisito no `acessoDaAula`, o beacon `POST /api/progresso` (sessão do
 * host, matrícula, Origin, tamanho, limite de frequência) e o tempo médio de 1.000 batidas.
 */
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { cabecalhosLogados, novoCriador } from "./_apoio";
import { alunoMatriculado, cursoPronto, envelhecer, membroCom, novaAula, progressoDe } from "./_progresso";

let reg: typeof import("@/lib/progresso/registrar");
let acesso: typeof import("@/lib/video/acesso-aula");
let beacon: typeof import("@/lib/progresso/beacon");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  reg = await import("@/lib/progresso/registrar");
  acesso = await import("@/lib/video/acesso-aula");
  beacon = await import("@/lib/progresso/beacon");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

/** Criador com curso publicado (aulas de 100 s) e um aluno matriculado. */
async function cenario(duracao = 100, aulas = 3) {
  const c = await novoCriador();
  const curso = await cursoPronto(c.id, { duracao, aulas });
  const aluno = await alunoMatriculado(c.id, curso.produto.id);
  const bater = (aulaId: string, intervalos: [number, number][], posicao: number, duracaoSeg = duracao) =>
    reg.registrarProgresso({ criadorId: c.id, membroId: aluno.membro.id, usuarioId: aluno.usuario.id, aulaId, intervalos, posicao, duracaoSeg });
  return { c, curso, aluno, bater, aula: curso.aulas[0] };
}

const visualizacoesDe = async (aulaId: string) =>
  (await db.select({ n: s.produtos_modulos_aulas_visualizacoes.visualizacoes }).from(s.produtos_modulos_aulas_visualizacoes).where(eq(s.produtos_modulos_aulas_visualizacoes.aula_id, aulaId)))[0]?.n ?? 0;

describe("registrarProgresso (uma instrução SQL)", () => {
  it("segundos ÚNICOS: rever o mesmo trecho não soma; bits ficam no lugar certo", async () => {
    const { aluno, bater, aula } = await cenario();
    expect(await bater(aula.id, [[0, 10]], 10)).toMatchObject({ percentual: 10, segundosAssistidos: 10, ultimaPosicaoSeg: 10, concluida: false });
    await envelhecer(aluno.membro.id, aula.id, 30);
    expect(await bater(aula.id, [[5, 15]], 15)).toMatchObject({ percentual: 15, segundosAssistidos: 15 });
    await envelhecer(aluno.membro.id, aula.id, 30);
    expect(await bater(aula.id, [[0, 15]], 15)).toMatchObject({ segundosAssistidos: 15 });
    const p = await progressoDe(aluno.membro.id, aula.id);
    expect(p.segundos_bitmap).toBe("1".repeat(15) + "0".repeat(85));
    expect(p.max_posicao_seg).toBe(15);
  });

  it("pular para o fim NÃO conclui: posição não conta, e declarar mais do que o tempo real é ignorado", async () => {
    const { aluno, bater, aula } = await cenario();
    await bater(aula.id, [[0, 5]], 5);
    // Arrastou a barra até 98 s: só a posição muda.
    expect(await bater(aula.id, [], 98)).toMatchObject({ percentual: 5, ultimaPosicaoSeg: 98, concluida: false });
    expect((await progressoDe(aluno.membro.id, aula.id)).max_posicao_seg).toBe(5);
    // Sem tempo decorrido, 30 s "assistidos" de uma vez estouram o teto (2x0 + 15 s): ignorada.
    expect(await bater(aula.id, [[70, 100]], 100)).toBeNull();
    // Script mandando trechos de 30 s seguidos: cada um precisa de ~8 s reais.
    await envelhecer(aluno.membro.id, aula.id, 8);
    expect(await bater(aula.id, [[70, 100]], 100)).toMatchObject({ percentual: 35, concluida: false });
    expect(await bater(aula.id, [[40, 70]], 70)).toBeNull();
  });

  it("90% assistido conclui (ASSISTIU) e nunca desconclui, nem trocando o vídeo por um mais longo", async () => {
    const { aluno, bater, aula } = await cenario();
    for (let ini = 0; ini < 90; ini += 15) {
      await envelhecer(aluno.membro.id, aula.id, 10);
      const r = await bater(aula.id, [[ini, ini + 15]], ini + 15);
      expect(r?.concluiuAgora).toBe(ini + 15 === 90);
    }
    const p = await progressoDe(aluno.membro.id, aula.id);
    expect(p).toMatchObject({ percentual: 90, concluida: true, concluida_por: "ASSISTIU" });
    // Vídeo trocado: 200 s. O bitmap é ajustado (45%), a conclusão fica.
    await db.update(s.produtos_modulos_aulas).set({ duracao_seg: 200 }).where(eq(s.produtos_modulos_aulas.id, aula.id));
    await envelhecer(aluno.membro.id, aula.id, 10);
    expect(await bater(aula.id, [], 10, 200)).toMatchObject({ percentual: 45, concluida: true, concluidaPor: "ASSISTIU", concluiuAgora: false });
    expect((await progressoDe(aluno.membro.id, aula.id)).concluida_em).toEqual(p.concluida_em);
  });

  it("89% não conclui; retomar volta à ÚLTIMA posição mesmo voltando no vídeo", async () => {
    const { aluno, bater, aula } = await cenario();
    for (let ini = 0; ini < 89; ini += 15) {
      await envelhecer(aluno.membro.id, aula.id, 10);
      await bater(aula.id, [[ini, Math.min(ini + 15, 89)]], Math.min(ini + 15, 89));
    }
    expect(await progressoDe(aluno.membro.id, aula.id)).toMatchObject({ percentual: 89, concluida: false, ultima_posicao_seg: 89 });
    await bater(aula.id, [], 20);
    expect(await progressoDe(aluno.membro.id, aula.id)).toMatchObject({ ultima_posicao_seg: 20, max_posicao_seg: 89 });
  });

  it("aula sem duração (vídeo não processado) ou de outro criador: ignorada, sem linha", async () => {
    const { c, aluno, curso } = await cenario();
    const semVideo = await novaAula(c.id, curso.modulo.id, 9, null);
    const base = { criadorId: c.id, membroId: aluno.membro.id, usuarioId: aluno.usuario.id, intervalos: [[0, 5]] as [number, number][], posicao: 5, duracaoSeg: 100 };
    expect(await reg.registrarProgresso({ ...base, aulaId: semVideo.id })).toBeNull();
    const outro = await novoCriador();
    const cursoB = await cursoPronto(outro.id);
    expect(await reg.registrarProgresso({ ...base, aulaId: cursoB.aulas[0].id })).toBeNull();
    expect(await progressoDe(aluno.membro.id, cursoB.aulas[0].id)).toBeUndefined();
    // O banco recusa progresso cruzado mesmo por fora do serviço (FK composta).
    await expect(
      db.insert(s.produtos_modulos_aulas_progressos).values({ criador_id: c.id, membro_id: aluno.membro.id, aula_id: cursoB.aulas[0].id, segundos_bitmap: "0", modified_by: c.id }),
    ).rejects.toThrow();
  });

  it("corrida: duas batidas SIMULTÂNEAS na linha nova mesclam (nada se perde, uma linha só)", async () => {
    const { aluno, bater, aula } = await cenario();
    const [r1, r2] = await Promise.all([bater(aula.id, [[0, 10]], 10), bater(aula.id, [[10, 20]], 20)]);
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    const linhas = await db.select().from(s.produtos_modulos_aulas_progressos).where(and(eq(s.produtos_modulos_aulas_progressos.membro_id, aluno.membro.id), eq(s.produtos_modulos_aulas_progressos.aula_id, aula.id)));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ segundos_assistidos: 20, percentual: 20 });
    // E várias ao mesmo tempo numa linha que já existe.
    await envelhecer(aluno.membro.id, aula.id, 60);
    await Promise.all([[20, 25], [25, 30], [30, 35], [35, 40]].map(([a, b]) => bater(aula.id, [[a, b]], b)));
    expect((await progressoDe(aluno.membro.id, aula.id)).segundos_assistidos).toBe(40);
    expect(await visualizacoesDe(aula.id)).toBe(1);
  });

  it("visualização do Top 10: 1 por membro, aula e dia (a 1ª batida com segundos assistidos)", async () => {
    const { c, curso, aluno, bater, aula } = await cenario();
    await bater(aula.id, [], 30); // só posição: não é visualização
    expect(await visualizacoesDe(aula.id)).toBe(0);
    await bater(aula.id, [[0, 5]], 5);
    await envelhecer(aluno.membro.id, aula.id, 20);
    await bater(aula.id, [[5, 10]], 10);
    expect(await visualizacoesDe(aula.id)).toBe(1);
    const outro = await alunoMatriculado(c.id, curso.produto.id);
    await reg.registrarProgresso({ criadorId: c.id, membroId: outro.membro.id, usuarioId: outro.usuario.id, aulaId: aula.id, intervalos: [[0, 3]], posicao: 3, duracaoSeg: 100 });
    expect(await visualizacoesDe(aula.id)).toBe(2);
    // Virou o dia (simulado): a mesma pessoa conta de novo.
    await db.update(s.produtos_modulos_aulas_progressos).set({ ultima_visualizacao_dia: "2020-01-01" }).where(eq(s.produtos_modulos_aulas_progressos.membro_id, aluno.membro.id));
    await envelhecer(aluno.membro.id, aula.id, 20);
    await bater(aula.id, [[10, 12]], 12);
    expect(await visualizacoesDe(aula.id)).toBe(3);
  });

  it("concluir manual: idempotente, trilha uma vez, e a matrícula conclui quando TODAS as aulas concluem", async () => {
    const { c, curso, aluno, bater } = await cenario(100, 2);
    const base = { criadorId: c.id, membroId: aluno.membro.id, usuarioId: aluno.usuario.id };
    const r = await reg.concluirManualmente({ ...base, aulaId: curso.aulas[0].id });
    expect(r).toMatchObject({ concluida: true, concluidaPor: "MANUAL", concluiuAgora: true, percentual: 0 });
    expect(await reg.concluirManualmente({ ...base, aulaId: curso.aulas[0].id })).toMatchObject({ concluiuAgora: false, concluidaPor: "MANUAL" });
    const trilha = await db.select().from(s.auditoria).where(and(eq(s.auditoria.user_id, aluno.usuario.id), eq(s.auditoria.tabela, "produtos_modulos_aulas_progressos")));
    expect(trilha).toHaveLength(1);
    const matricula = async () => (await db.select().from(s.produtos_matriculas).where(eq(s.produtos_matriculas.membro_id, aluno.membro.id)))[0];
    expect((await matricula()).concluida_em).toBeNull();
    // Assistir depois de concluir manualmente não troca a forma de conclusão.
    await bater(curso.aulas[0].id, [[0, 10]], 10);
    expect(await progressoDe(aluno.membro.id, curso.aulas[0].id)).toMatchObject({ concluida_por: "MANUAL", percentual: 10 });
    const versao = (await matricula()).updated_at;
    await reg.concluirManualmente({ ...base, aulaId: curso.aulas[1].id });
    expect((await matricula()).concluida_em).not.toBeNull();
    // Atualização de sistema: a versão da trava da tela de matrículas não muda.
    expect((await matricula()).updated_at).toEqual(versao);
  });
});

describe("pré-requisito no acessoDaAula (fecha o TODO do passo 5)", () => {
  it("bloqueia até concluir; equipe ignora; pré-requisito removido não trava mais", async () => {
    const { c, curso, aluno } = await cenario();
    const [a1, a2] = curso.aulas;
    await db.update(s.produtos_modulos_aulas).set({ pre_requisito_aula_id: a1.id }).where(eq(s.produtos_modulos_aulas.id, a2.id));
    const comoAluno = { papel: "ALUNO" as const, membroId: aluno.membro.id };
    expect(await acesso.acessoDaAula(c.id, a2.id, comoAluno)).toMatchObject({ pode: false, motivo: "PRE_REQUISITO" });
    const admin = await membroCom(c.id, "ADMIN");
    expect(await acesso.acessoDaAula(c.id, a2.id, { papel: "ADMIN", membroId: admin.membro.id })).toMatchObject({ pode: true });
    // Assistiu só metade: segue travada.
    await reg.registrarProgresso({ criadorId: c.id, membroId: aluno.membro.id, usuarioId: aluno.usuario.id, aulaId: a1.id, intervalos: [[0, 30]], posicao: 30, duracaoSeg: 100 });
    expect((await acesso.acessoDaAula(c.id, a2.id, comoAluno))?.motivo).toBe("PRE_REQUISITO");
    await reg.concluirManualmente({ criadorId: c.id, membroId: aluno.membro.id, usuarioId: aluno.usuario.id, aulaId: a1.id });
    expect(await acesso.acessoDaAula(c.id, a2.id, comoAluno)).toMatchObject({ pode: true, motivo: null });
    // Outro aluno: a conclusão do primeiro não vale para ele.
    const outro = await alunoMatriculado(c.id, curso.produto.id);
    expect((await acesso.acessoDaAula(c.id, a2.id, { papel: "ALUNO", membroId: outro.membro.id }))?.motivo).toBe("PRE_REQUISITO");
    await db.update(s.produtos_modulos_aulas).set({ is_deleted: true, deleted_at: new Date() }).where(eq(s.produtos_modulos_aulas.id, a1.id));
    expect((await acesso.acessoDaAula(c.id, a2.id, { papel: "ALUNO", membroId: outro.membro.id }))?.pode).toBe(true);
  });
});

describe("POST /api/progresso (beacon)", () => {
  const pedido = (h: Headers, corpo: string, extra: Record<string, string> = {}) => {
    const cab = new Headers(h);
    for (const [k, v] of Object.entries(extra)) cab.set(k, v);
    return new Request(`http://${h.get("host")}/api/progresso`, { method: "POST", headers: cab, body: corpo });
  };
  const corpo = (aulaId: string, intervalos: [number, number][] = [[0, 10]], posicao = 10) => JSON.stringify({ aulaId, intervalos, posicao, duracaoSeg: 100 });

  it("aluno matriculado registra (204); 2ª batida em < 3 s é ignorada sem erro; Origin de fora, corpo grande ou inválido recusam", async () => {
    const { c, curso, aluno } = await cenario();
    const aula = curso.aulas[0];
    const h = await cabecalhosLogados(aluno.usuario.email, c.slug);
    expect((await beacon.atenderBeacon(pedido(h, corpo(aula.id), { origin: `http://${h.get("host")}` }))).status).toBe(204);
    expect(await progressoDe(aluno.membro.id, aula.id)).toMatchObject({ segundos_assistidos: 10 });
    await envelhecer(aluno.membro.id, aula.id, 60);
    expect((await beacon.atenderBeacon(pedido(h, corpo(aula.id, [[10, 20]], 20)))).status).toBe(204);
    expect((await progressoDe(aluno.membro.id, aula.id)).segundos_assistidos).toBe(10); // limite de frequência
    expect((await beacon.atenderBeacon(pedido(h, corpo(curso.aulas[1].id)))).status).toBe(204); // outra aula: outra chave
    expect((await beacon.atenderBeacon(pedido(h, corpo(aula.id), { origin: "https://golpe.example" }))).status).toBe(403);
    expect((await beacon.atenderBeacon(pedido(h, JSON.stringify({ aulaId: aula.id, intervalos: [], posicao: 1, duracaoSeg: 100, x: "a".repeat(5000) })))).status).toBe(413);
    expect((await beacon.atenderBeacon(pedido(h, "{nao-json"))).status).toBe(400);
    expect((await beacon.atenderBeacon(pedido(h, corpo(aula.id, [[0, 100]], 100)))).status).toBe(400);
  });

  it("sem sessão 401; sessão de A no host de B 401; aula de outro criador 404; sem matrícula 403 (nada gravado)", async () => {
    const { c, curso, aluno } = await cenario();
    const b = await novoCriador();
    const cursoB = await cursoPronto(b.id);
    const alunoB = await alunoMatriculado(b.id, cursoB.produto.id);
    const hA = await cabecalhosLogados(aluno.usuario.email, c.slug);
    const semCookie = new Headers(hA);
    semCookie.delete("cookie");
    expect((await beacon.atenderBeacon(pedido(semCookie, corpo(curso.aulas[0].id)))).status).toBe(401);
    // Cookie da sessão de A levado ao host de B.
    const hNoB = new Headers(hA);
    hNoB.set("host", `${b.slug}.localhost:3011`);
    expect((await beacon.atenderBeacon(pedido(hNoB, corpo(cursoB.aulas[0].id)))).status).toBe(401);
    // Aluno de B no host de B mandando aula de A.
    const hB = await cabecalhosLogados(alunoB.usuario.email, b.slug);
    expect((await beacon.atenderBeacon(pedido(hB, corpo(curso.aulas[0].id)))).status).toBe(404);
    expect(await progressoDe(alunoB.membro.id, curso.aulas[0].id)).toBeUndefined();
    // Membro de A sem matrícula.
    const semMatricula = await membroCom(c.id, "ALUNO");
    const hSem = await cabecalhosLogados(semMatricula.usuario.email, c.slug);
    expect((await beacon.atenderBeacon(pedido(hSem, corpo(curso.aulas[0].id)))).status).toBe(403);
    expect(await progressoDe(semMatricula.membro.id, curso.aulas[0].id)).toBeUndefined();
    // Matrícula expirada: idem.
    await db.update(s.produtos_matriculas).set({ expira_em: new Date(Date.now() - 1000) }).where(eq(s.produtos_matriculas.membro_id, aluno.membro.id));
    expect((await beacon.atenderBeacon(pedido(hA, corpo(curso.aulas[2].id)))).status).toBe(403);
  });
});

describe("desempenho", () => {
  it("1.000 batidas sequenciais no banco local: tempo médio por batida", async () => {
    const { aluno, bater, aula } = await cenario(6000, 1);
    await bater(aula.id, [[0, 5]], 5);
    const N = 1000;
    const inicio = performance.now();
    for (let i = 1; i <= N; i++) {
      // 5 s por batida: dentro do teto (15 s de folga) mesmo sem tempo real passando.
      const r = await bater(aula.id, [[i * 5, i * 5 + 5]], i * 5 + 5);
      if (!r) throw new Error(`batida ${i} ignorada`);
    }
    const mediaMs = (performance.now() - inicio) / N;
    process.stderr.write(`\nDESEMPENHO: ${N} batidas sequenciais, média ${mediaMs.toFixed(2)} ms por batida\n`);
    const p = await progressoDe(aluno.membro.id, aula.id);
    expect(p.segundos_assistidos).toBe(5005);
    expect(p.concluida).toBe(false); // 5005 de 6000 = 83%
    const [{ tamanho }] = (await db.execute<{ tamanho: number }>(sql`select pg_column_size(segundos_bitmap)::int as tamanho from produtos_modulos_aulas_progressos where id = ${p.id}`)).rows;
    expect(tamanho).toBeLessThan(800); // 6000 bits = 750 bytes + cabeçalho
    expect(mediaMs).toBeLessThan(50);
  });
});
