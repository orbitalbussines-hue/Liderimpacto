/**
 * Telas restantes do admin no PostgreSQL real: Estúdio de vídeo (lista, totais, fila por criador e
 * fila fora do ar), hub da Área de membros, Configurações > Geral (renomear com trava e trilha),
 * Logs (só do criador, mascarado, sem jsonb, aba Excluídos, cursor) e Equipe (filtro de papel).
 * Isolamento A x B em tudo; ADMIN e ALUNO fora das telas só do DONO.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador, trilhaDe } from "./_apoio";
import { cursoPronto, membroCom } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));

let estudio: typeof import("@/lib/video/estudio");
let trilha: typeof import("@/lib/audit/consultas");
let audit: typeof import("@/lib/audit/registrar");
let consultasCriador: typeof import("@/lib/criador/consultas");
let membros: typeof import("@/lib/membros/consultas");
let config: typeof import("@/lib/actions/configuracoes");
let guarda: typeof import("@/lib/auth/guarda");
let EQUIPE: typeof import("@/lib/auth/permissoes").EQUIPE;
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  estudio = await import("@/lib/video/estudio");
  trilha = await import("@/lib/audit/consultas");
  audit = await import("@/lib/audit/registrar");
  consultasCriador = await import("@/lib/criador/consultas");
  membros = await import("@/lib/membros/consultas");
  config = await import("@/lib/actions/configuracoes");
  guarda = await import("@/lib/auth/guarda");
  EQUIPE = (await import("@/lib/auth/permissoes")).EQUIPE;
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

type Situacao = "ENVIANDO" | "PROCESSANDO" | "PRONTO" | "FALHOU";

async function video(criadorId: string, aulaId: string, situacao: Situacao, extra: { duracao?: number; tamanho?: number; erro?: string } = {}) {
  const id = randomUUID();
  const [v] = await db
    .insert(s.produtos_modulos_aulas_videos)
    .values({
      id,
      criador_id: criadorId,
      aula_id: aulaId,
      situacao,
      nome_original: `video-${id.slice(0, 4)}.mp4`,
      mime: "video/mp4",
      tamanho_bytes: extra.tamanho ?? 1024 * 1024,
      chave_origem: `criadores/${criadorId}/videos/${id}/original.mp4`,
      chave_cifrada: "cifrada-de-teste",
      duracao_seg: extra.duracao ?? null,
      resolucoes: situacao === "PRONTO" ? ["720p", "1080p"] : [],
      erro: extra.erro ?? null,
      modified_by: criadorId,
    })
    .returning();
  return v;
}

/** Dois criadores, cada um com curso de 3 aulas e vídeos em situações diferentes. */
async function cenarioEstudio() {
  const A = await novoCriador("Área A");
  const B = await novoCriador("Área B");
  const cursoA = await cursoPronto(A.id);
  const cursoB = await cursoPronto(B.id);
  const pronto = await video(A.id, cursoA.aulas[0].id, "PRONTO", { duracao: 3600, tamanho: 2 * 1024 ** 3 });
  const falhou = await video(A.id, cursoA.aulas[1].id, "FALHOU", { erro: "Arquivo corrompido: não foi possível ler o vídeo." });
  const daAulaRemovida = await video(A.id, cursoA.aulas[2].id, "PRONTO", { duracao: 999 });
  await db.update(s.produtos_modulos_aulas).set({ is_deleted: true, deleted_at: new Date() }).where(eq(s.produtos_modulos_aulas.id, cursoA.aulas[2].id));
  const deB = await video(B.id, cursoB.aulas[0].id, "PROCESSANDO");
  return { A, B, cursoA, cursoB, pronto, falhou, daAulaRemovida, deB };
}

describe("Estúdio de vídeo", () => {
  it("lista e totaliza só os vídeos vivos do criador, com filtros", async () => {
    const c = await cenarioEstudio();
    const lista = await estudio.listarVideos(c.A.id, { pagina: 1, porPagina: 20 });
    expect(lista.total).toBe(2);
    expect(lista.linhas.map((l) => l.id).sort()).toEqual([c.pronto.id, c.falhou.id].sort());
    expect(lista.linhas.find((l) => l.id === c.falhou.id)).toMatchObject({ erro: "Arquivo corrompido: não foi possível ler o vídeo.", produto: c.cursoA.produto.titulo });
    // Vídeo de outro criador e o da aula removida nunca aparecem.
    expect(lista.linhas.some((l) => l.id === c.deB.id || l.id === c.daAulaRemovida.id)).toBe(false);

    expect(await estudio.totaisDoEstudio(c.A.id)).toEqual({ videos: 2, segundosProntos: 3600, bytesOriginais: 2 * 1024 ** 3 + 1024 * 1024, processando: 0, falhos: 1 });
    expect((await estudio.listarVideos(c.A.id, { situacao: "FALHOU", pagina: 1, porPagina: 20 })).linhas.map((l) => l.id)).toEqual([c.falhou.id]);
    expect((await estudio.listarVideos(c.A.id, { produtoId: c.cursoB.produto.id, pagina: 1, porPagina: 20 })).total).toBe(0);
    expect((await estudio.listarVideos(c.A.id, { busca: c.falhou.nome_original, pagina: 1, porPagina: 20 })).linhas.map((l) => l.id)).toEqual([c.falhou.id]);
    expect(await estudio.produtosComVideo(c.A.id)).toEqual([{ id: c.cursoA.produto.id, titulo: c.cursoA.produto.titulo }]);
  });

  it("fila fora do ar vira 'indisponível' rápido, sem lançar", async () => {
    const filas = estudio.criarFilasDoEstudio({ host: "127.0.0.1", port: 1, maxRetriesPerRequest: 1, connectTimeout: 300, retryStrategy: () => null });
    const inicio = Date.now();
    expect(await estudio.estadoDaFila(randomUUID(), filas)).toEqual({ disponivel: false });
    expect(Date.now() - inicio).toBeLessThan(4000);
    await Promise.allSettled([filas.fila.close(), filas.dlq.close()]);
  });

  it.runIf(!!process.env.REDIS_URL)("fila no ar: conta só os jobs dos vídeos do criador", async () => {
    const c = await cenarioEstudio();
    const filas = estudio.criarFilasDoEstudio();
    const jobs = [
      await filas.fila.add("transcodificar", { videoId: c.falhou.id }, { jobId: c.falhou.id, delay: 3_600_000 }),
      await filas.fila.add("transcodificar", { videoId: c.deB.id }, { jobId: c.deB.id, delay: 3_600_000 }),
      await filas.dlq.add("falhou", { videoId: c.pronto.id }),
    ];
    try {
      expect(await estudio.estadoDaFila(c.A.id, filas)).toEqual({ disponivel: true, aguardando: 1, processando: 0, falhos: 1 });
      expect(await estudio.estadoDaFila(c.B.id, filas)).toEqual({ disponivel: true, aguardando: 1, processando: 0, falhos: 0 });
    } finally {
      await Promise.allSettled(jobs.map((j) => j.remove()));
      await Promise.allSettled([filas.fila.close(), filas.dlq.close()]);
    }
  });
});

describe("Área de membros e Equipe", () => {
  it("resumo conta só o criador: ativos, alunos e produtos publicados", async () => {
    const A = await novoCriador();
    const B = await novoCriador();
    await membroCom(A.id, "DONO");
    await membroCom(A.id, "ALUNO");
    const inativo = await membroCom(A.id, "ALUNO");
    await db.update(s.criadores_membros).set({ status: "INATIVO" }).where(eq(s.criadores_membros.id, inativo.membro.id));
    await cursoPronto(A.id);
    await cursoPronto(A.id, { status: "RASCUNHO" });
    await membroCom(B.id, "ALUNO");
    await cursoPronto(B.id);
    expect(await consultasCriador.resumoDaArea(A.id)).toEqual({ membros: 2, alunos: 1, cursos: 1 });
    expect(await consultasCriador.dadosDaArea(A.id)).toMatchObject({ nome: A.nome, slug: A.slug, dominioProprio: null });
  });

  it("equipe = só DONO e ADMIN do criador", async () => {
    const A = await novoCriador();
    const B = await novoCriador();
    const dono = await membroCom(A.id, "DONO");
    const admin = await membroCom(A.id, "ADMIN");
    await membroCom(A.id, "ALUNO");
    await membroCom(B.id, "ADMIN");
    const equipe = await membros.listarMembros(A.id, { papeis: ["DONO", "ADMIN"], pagina: 1, porPagina: 50 });
    expect(equipe.linhas.map((m) => m.id).sort()).toEqual([dono.membro.id, admin.membro.id].sort());
  });
});

describe("Configurações (só DONO)", () => {
  it("telas só do DONO: ADMIN e ALUNO recebem 403", async () => {
    const A = await novoCriador();
    const dono = await membroCom(A.id, "DONO");
    const admin = await membroCom(A.id, "ADMIN");
    const aluno = await membroCom(A.id, "ALUNO");
    req.h = await cabecalhosLogados(dono.usuario.email, A.slug);
    expect((await guarda.membroDaPagina(["DONO"])).criador.id).toBe(A.id);
    for (const m of [admin, aluno]) {
      req.h = await cabecalhosLogados(m.usuario.email, A.slug);
      await expect(guarda.membroDaPagina(["DONO"])).rejects.toThrow();
    }
    // ADMIN segue entrando no Estúdio e na Área de membros (EQUIPE); ALUNO não.
    req.h = await cabecalhosLogados(admin.usuario.email, A.slug);
    expect((await guarda.membroDaPagina(EQUIPE)).membro.papel).toBe("ADMIN");
    req.h = await cabecalhosLogados(aluno.usuario.email, A.slug);
    await expect(guarda.membroDaPagina(EQUIPE)).rejects.toThrow();
  });

  it("renomear a área: DONO com trava e trilha; ADMIN, ALUNO e outro criador não", async () => {
    const A = await novoCriador("Nome Antigo");
    const B = await novoCriador("Área B");
    const dono = await membroCom(A.id, "DONO");
    const admin = await membroCom(A.id, "ADMIN");
    const aluno = await membroCom(A.id, "ALUNO");
    const v1 = A.updated_at.toISOString();

    for (const m of [admin, aluno]) {
      req.h = await cabecalhosLogados(m.usuario.email, A.slug);
      expect(await config.acaoRenomearArea({ nome: "Invadido", versao: v1 })).toMatchObject({ ok: false });
    }
    req.h = await cabecalhosLogados(dono.usuario.email, A.slug);
    expect(await config.acaoRenomearArea({ nome: " ", versao: v1 })).toMatchObject({ ok: false });
    const r = await config.acaoRenomearArea({ nome: "  Nome Novo  ", versao: v1 });
    expect(r).toMatchObject({ ok: true, dados: { nome: "Nome Novo" } });
    // A mesma versão de novo = colisão (outra aba editou).
    expect(await config.acaoRenomearArea({ nome: "Outro", versao: v1 })).toMatchObject({ ok: false, erro: expect.stringMatching(/alterado por outro/) });
    expect((await consultasCriador.dadosDaArea(A.id))?.nome).toBe("Nome Novo");
    expect((await consultasCriador.dadosDaArea(B.id))?.nome).toBe("Área B");
    const t = await trilhaDe(dono.usuario.id);
    expect(t.some((e) => e.tabela === "criadores" && e.criador_id === A.id && e.detalhes.includes('"Nome Antigo" → "Nome Novo"'))).toBe(true);
  });
});

describe("Logs (trilha do criador)", () => {
  it("só eventos do criador, mascarados, sem jsonb; Excluídos; filtros e cursor", async () => {
    const A = await novoCriador();
    const B = await novoCriador();
    const dono = await membroCom(A.id, "DONO");
    const donoB = await membroCom(B.id, "DONO");
    const reg = (criadorId: string, userId: string | null, acao: Parameters<typeof audit.registrarAuditoria>[1]["acao"], tabela: string, detalhes: string) =>
      audit.registrarAuditoria(db, { userId, criadorId, acao, tabela, registroId: randomUUID(), detalhes, dadosAnteriores: { segredo: "NUNCA-NA-TELA" } });

    await reg(A.id, dono.usuario.id, "atualizar", "criadores_membros", "Papel de maria.souza@cliente.com: ALUNO → ADMIN");
    await reg(A.id, null, "login_recusado", "usuarios", "Tentativa com e-mail inexistente · IP 200.100.50.25 · vitest");
    await reg(A.id, dono.usuario.id, "excluir", "produtos", 'Removeu o produto "Curso Velho" (Cód. 9) (exclusão lógica)');
    for (let i = 0; i < 4; i++) await reg(A.id, dono.usuario.id, "criar", "criadores_grupos", `Criou o grupo "G${i}" (TURMA)`);
    await reg(B.id, donoB.usuario.id, "excluir", "produtos", 'Removeu o produto "Curso de B"');

    const todos = await trilha.listarTrilha(A.id, { limite: 100 });
    expect(todos.linhas).toHaveLength(7);
    expect(JSON.stringify(todos.linhas)).not.toContain("Curso de B");
    expect(JSON.stringify(todos.linhas)).not.toContain("NUNCA-NA-TELA");
    expect(JSON.stringify(todos.linhas)).not.toContain("maria.souza@cliente.com");
    expect(JSON.stringify(todos.linhas)).not.toContain("200.100.50.25");
    expect(todos.linhas.map((l) => l.detalhes)).toContain("Papel de m•••@cliente.com: ALUNO → ADMIN");
    expect(todos.linhas.find((l) => l.acao === "login_recusado")?.pessoa).toBeNull();

    const excl = await trilha.listarTrilha(A.id, { somenteExclusoes: true, limite: 100 });
    expect(excl.linhas).toHaveLength(1);
    expect(excl.linhas[0]).toMatchObject({ titulo: "Curso Velho", entidade: "Produto", pessoa: dono.usuario.nome });

    expect((await trilha.listarTrilha(A.id, { acao: "criar", limite: 100 })).linhas).toHaveLength(4);
    expect((await trilha.listarTrilha(A.id, { tabela: "usuarios", limite: 100 })).linhas).toHaveLength(1);
    expect((await trilha.listarTrilha(A.id, { pessoa: "zzz-ninguem", limite: 100 })).linhas).toHaveLength(0);
    // Período de/ate (dias de Brasília): hoje pega tudo; um intervalo que termina ontem não pega nada de hoje.
    const { hojeEmBrasilia, somarDias } = await import("@/lib/painel/periodo");
    const hoje = hojeEmBrasilia();
    expect((await trilha.listarTrilha(A.id, { periodo: { de: hoje, ate: hoje }, limite: 100 })).linhas).toHaveLength(7);
    expect((await trilha.listarTrilha(A.id, { periodo: { de: somarDias(hoje, -7), ate: somarDias(hoje, -1) }, limite: 100 })).linhas).toHaveLength(0);

    // Cursor: 3 + 3 + 1, sem repetir nem pular.
    const regras = await import("@/lib/audit/regras");
    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 5; i++) {
      const p = await trilha.listarTrilha(A.id, { limite: 3, cursor: regras.lerCursor(cursor ?? undefined) });
      vistos.push(...p.linhas.map((l) => l.id));
      cursor = p.proximo;
      if (!cursor) break;
    }
    expect(vistos).toEqual(todos.linhas.map((l) => l.id));

    const entidades = await trilha.entidadesDaTrilha(A.id);
    expect(entidades.map((e) => e.tabela).sort()).toEqual(["criadores_grupos", "criadores_membros", "produtos", "usuarios"]);
  });
});
