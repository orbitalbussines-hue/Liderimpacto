/**
 * Construtor da vitrine (passo 9, RN-135 a RN-138) no PostgreSQL real: rascunho com trava,
 * publicar (versões imutáveis), reverter, descartar; validação do JSON e das referências (outro
 * criador = recusa); resolução de cada fileira (quantidade, ordenação, audiência por grupo,
 * MANUAL só o que o aluno vê, vazia oculta); sem config = padrão; prévia só equipe; player lendo
 * as flags publicadas; isolamento A×B e ALUNO recusado.
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cabecalhosLogados, novoCriador } from "./_apoio";
import { arquivoPronto, ok } from "./_catalogo";
import { concluirAulas } from "./_passo7";
import { alunoMatriculado, cursoPronto, membroCom, quem } from "./_progresso";

const req = vi.hoisted(() => ({ h: new Headers() }));
vi.mock("next/headers", async (original) => ({ ...(await original<typeof import("next/headers")>()), headers: async () => req.h }));
// Fora do Next não há cache: `"use cache"` vira função comum e as etiquetas não fazem nada.
vi.mock("next/cache", () => ({ cacheTag: () => {}, cacheLife: () => {}, updateTag: () => {}, revalidateTag: () => {}, revalidatePath: () => {} }));

let acoes: typeof import("@/lib/actions/vitrine");
let dados: typeof import("@/lib/vitrine/dados");
let res: typeof import("@/lib/vitrine/resolver");
let cfg: typeof import("@/lib/vitrine/config");
let player: typeof import("@/lib/progresso/consultas");
let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  acoes = await import("@/lib/actions/vitrine");
  dados = await import("@/lib/vitrine/dados");
  res = await import("@/lib/vitrine/resolver");
  cfg = await import("@/lib/vitrine/config");
  player = await import("@/lib/progresso/consultas");
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
});

type Config = import("@/lib/vitrine/config").ConfigVitrine;
type Fileira = import("@/lib/vitrine/config").FileiraVitrine;

const fileira = (id: string, tipo: Fileira["tipo"], extra: Partial<Fileira> = {}): Fileira => ({
  id,
  titulo: `Fileira ${id}`,
  tipo,
  quantidade: 10,
  ordenacao: cfg.ORDENACOES_DO_TIPO[tipo][0],
  grupos: [],
  visivel: true,
  itensManuais: [],
  ...extra,
});

/** Criador com 1 curso publicado (aluno matriculado) e um admin logado no host. */
async function cenario() {
  const cr = await novoCriador();
  const curso = await cursoPronto(cr.id, { aulas: 3 });
  const aluno = await alunoMatriculado(cr.id, curso.produto.id);
  const admin = await membroCom(cr.id, "ADMIN");
  req.h = await cabecalhosLogados(admin.usuario.email, cr.slug);
  const qAluno = { ...quem(cr.id, aluno), usuario: { id: aluno.usuario.id, nome: "Ana Souza" } };
  const qAdmin = { ...quem(cr.id, admin), usuario: { id: admin.usuario.id, nome: "Admin" } };
  return { cr, curso, aluno, admin, qAluno, qAdmin };
}

const base = (x: Awaited<ReturnType<typeof cenario>>, mudar: Partial<Config> = {}): Config => ({ ...cfg.configPadrao({ id: x.curso.produto.id, titulo: x.curso.produto.titulo, descricao: null }), ...mudar });

describe("rascunho, publicar, versões, reverter e descartar", () => {
  it("autosave com trava; publicar cria versão imutável; reverter não publica; descartar volta à publicada", async () => {
    const x = await cenario();
    const inicio = await dados.dadosDoConstrutor(x.cr.id);
    expect(inicio.versao).toBeNull();
    expect(inicio.publicada).toBeNull();
    expect(inicio.rascunho.destaque.titulo).toBe(x.curso.produto.titulo);
    expect(inicio.rascunho.fileiras.map((f) => f.tipo)).toEqual(["CONTINUAR", "TOP10", "NOVIDADES", "TRILHAS", "MENTORIAS", "LISTA"]);

    const a = { ...inicio.rascunho, destaque: { ...inicio.rascunho.destaque, titulo: "Versão A" } };
    const v1 = ok(await acoes.acaoSalvarRascunhoVitrine({ versao: null, config: a })).versao;
    expect(await acoes.acaoSalvarRascunhoVitrine({ versao: null, config: a })).toMatchObject({ ok: false, erro: /Outra pessoa alterou/ });
    const v2 = ok(await acoes.acaoSalvarRascunhoVitrine({ versao: v1, config: { ...a, fileiras: a.fileiras.slice(1) } })).versao;
    expect(await acoes.acaoSalvarRascunhoVitrine({ versao: v1, config: a })).toMatchObject({ ok: false, erro: /Outra pessoa alterou/ });
    expect(await acoes.acaoPublicarVitrine({ versao: v1 })).toMatchObject({ ok: false, erro: /Outra pessoa alterou/ });

    const p1 = ok(await acoes.acaoPublicarVitrine({ versao: v2 }));
    expect(p1).toMatchObject({ numero: 1, versao: v2 });
    expect((await dados.publicadaAgora(x.cr.id))!.config.fileiras).toHaveLength(5);

    const b = { ...a, destaque: { ...a.destaque, titulo: "Versão B" } };
    const v3 = ok(await acoes.acaoSalvarRascunhoVitrine({ versao: v2, config: b })).versao;
    expect(ok(await acoes.acaoPublicarVitrine({ versao: v3 })).numero).toBe(2);

    const rev = ok(await acoes.acaoReverterVitrine({ versao: v3, numero: 1 }));
    expect(rev.config.destaque.titulo).toBe("Versão A");
    expect((await dados.publicadaAgora(x.cr.id))!.numero).toBe(2); // reverter NÃO publica
    expect((await dados.publicadaAgora(x.cr.id))!.config.destaque.titulo).toBe("Versão B");
    expect(await acoes.acaoReverterVitrine({ versao: rev.versao, numero: 9 })).toMatchObject({ ok: false, erro: /Versão não encontrada/ });

    const desc = ok(await acoes.acaoDescartarRascunhoVitrine({ versao: rev.versao }));
    expect(desc.config.destaque.titulo).toBe("Versão B");
    const fim = await dados.dadosDoConstrutor(x.cr.id);
    expect(fim.versao).toBe(desc.versao);
    expect(fim.historico.map((h) => h.numero)).toEqual([2, 1]);
    expect(cfg.mesmaConfig(fim.rascunho, fim.publicada!.config)).toBe(true);
    // A versão 1 continua como foi publicada (imutável).
    const [v] = await db.select().from(s.criadores_vitrines_versoes).where(and(eq(s.criadores_vitrines_versoes.criador_id, x.cr.id), eq(s.criadores_vitrines_versoes.numero, 1)));
    expect(v.config.destaque.titulo).toBe("Versão A");
    expect(v.publicada_por).toBe(x.admin.usuario.id);
    const trilha = await db.select().from(s.auditoria).where(and(eq(s.auditoria.criador_id, x.cr.id), eq(s.auditoria.acao, "publicar")));
    expect(trilha.map((t) => t.detalhes).sort()).toEqual(["Publicou a vitrine (versão 1)", "Publicou a vitrine (versão 2)"]);
  });

  it("publicar sem nunca ter salvo publica o padrão (cria o rascunho)", async () => {
    const x = await cenario();
    const p = ok(await acoes.acaoPublicarVitrine({ versao: null }));
    expect(p.numero).toBe(1);
    expect((await dados.dadosDoConstrutor(x.cr.id)).versao).toBe(p.versao);
  });
});

describe("validação do JSON e das referências", () => {
  it("recusa tipo/quantidade/ordenação inválidos, campo a mais e refs de outro criador", async () => {
    const x = await cenario();
    const outro = await novoCriador();
    const cursoDeB = await cursoPronto(outro.id, { aulas: 1 });
    const [grupoDeB] = await db.insert(s.criadores_grupos).values({ criador_id: outro.id, nome: "B", modified_by: outro.id }).returning();
    const imgDeB = await arquivoPronto(outro.id);
    const c = base(x);
    const salvar = (config: unknown) => acoes.acaoSalvarRascunhoVitrine({ versao: null, config });
    expect(await salvar({ ...c, fileiras: [{ ...fileira("a", "TOP10"), tipo: "QUALQUER" }] })).toMatchObject({ ok: false, erro: /Tipo de fileira inválido/ });
    expect(await salvar({ ...c, fileiras: [{ ...fileira("a", "TOP10"), quantidade: 4 }] })).toMatchObject({ ok: false, erro: /3, 5, 7 ou 10/ });
    expect(await salvar({ ...c, fileiras: [fileira("a", "LISTA", { ordenacao: "MAIS_ASSISTIDOS" })] })).toMatchObject({ ok: false, erro: /não combina/ });
    expect(await salvar({ ...c, extra: 1 })).toMatchObject({ ok: false });
    expect(await salvar({ ...c, fileiras: [{ ...fileira("a", "TOP10"), html: "<b>" }] })).toMatchObject({ ok: false });
    expect(await salvar({ ...c, fileiras: [fileira("a", "TOP10"), fileira("a", "LISTA")] })).toMatchObject({ ok: false, erro: /repetida/ });
    expect(await salvar({ ...c, destaque: { ...c.destaque, botaoPrincipal: { texto: "Ir", acao: "LINK", alvo: "https://golpe.example" } } })).toMatchObject({ ok: false, erro: /caminho interno/ });
    expect(await salvar({ ...c, destaque: { ...c.destaque, botaoPrincipal: { texto: "Ir", acao: "LINK", alvo: "//golpe.example" } } })).toMatchObject({ ok: false, erro: /caminho interno/ });
    const refB = [
      { ...c, destaque: { ...c.destaque, botaoPrincipal: { texto: "Ir", acao: "CURSO", alvo: cursoDeB.produto.id } } },
      { ...c, destaque: { ...c.destaque, imagemArquivoId: imgDeB.id } },
      { ...c, fileiras: [fileira("a", "LISTA", { grupos: [grupoDeB.id] })] },
      { ...c, fileiras: [fileira("a", "MANUAL", { itensManuais: [{ tipo: "AULA", id: cursoDeB.aulas[0].id }] })] },
    ];
    for (const r of refB) expect(await salvar(r)).toMatchObject({ ok: false, erro: /não é desta área/ });
    expect(await acoes.acaoPrepararImagemDestaque({ arquivoId: imgDeB.id })).toMatchObject({ ok: false });
    const minha = await arquivoPronto(x.cr.id);
    expect(ok(await salvar({ ...c, destaque: { ...c.destaque, imagemArquivoId: minha.id } })).versao).toBeTruthy();
  });
});

describe("resolução das fileiras", () => {
  it("quantidade, ordenação MAIS_ASSISTIDOS, audiência por grupo, vazia oculta e MANUAL só o que o aluno vê", async () => {
    const x = await cenario();
    const ments = [];
    for (let i = 0; i < 4; i++) ments.push(await cursoPronto(x.cr.id, { aulas: 1, tipo: "MENTORIA" }));
    // A 3ª mentoria é a mais vista (2 visualizações hoje), a 1ª vem depois.
    const hoje = new Date().toISOString().slice(0, 10);
    await db.insert(s.produtos_modulos_aulas_visualizacoes).values([
      { criador_id: x.cr.id, aula_id: ments[2].aulas[0].id, dia: hoje, visualizacoes: 2, modified_by: x.cr.id },
      { criador_id: x.cr.id, aula_id: ments[0].aulas[0].id, dia: hoje, visualizacoes: 1, modified_by: x.cr.id },
    ]);
    const [grupo] = await db.insert(s.criadores_grupos).values({ criador_id: x.cr.id, nome: "Mentoria", modified_by: x.cr.id }).returning();
    const rascunho = await cursoPronto(x.cr.id, { aulas: 1, status: "RASCUNHO" });
    const semMatricula = await cursoPronto(x.cr.id, { aulas: 1 });
    const config = base(x, {
      fileiras: [
        fileira("ment", "MENTORIAS", { quantidade: 3 }),
        fileira("mais", "MENTORIAS", { quantidade: 3, ordenacao: "MAIS_ASSISTIDOS" }),
        fileira("grupo", "MENTORIAS", { grupos: [grupo.id], titulo: "Só do grupo" }),
        fileira("lista", "LISTA"),
        fileira("oculta", "MENTORIAS", { visivel: false }),
        fileira("man", "MANUAL", {
          itensManuais: [
            { tipo: "AULA", id: x.curso.aulas[1].id },
            { tipo: "PRODUTO", id: rascunho.produto.id },
            { tipo: "AULA", id: semMatricula.aulas[0].id },
            { tipo: "PRODUTO", id: semMatricula.produto.id },
          ],
        }),
      ],
    });
    const v = ok(await acoes.acaoSalvarRascunhoVitrine({ versao: null, config })).versao;
    ok(await acoes.acaoPublicarVitrine({ versao: v }));

    const vit = await res.vitrineDoAluno(x.qAluno);
    expect(vit.fileiras.map((f) => f.id)).toEqual(["ment", "mais", "man"]); // grupo: aluno fora; lista vazia; oculta
    expect(vit.fileiras[0].itens).toHaveLength(3);
    expect(vit.fileiras[1].itens.slice(0, 2).map((i) => i.id)).toEqual([ments[2].produto.id, ments[0].produto.id]);
    expect(vit.fileiras[2].itens.map((i) => i.id)).toEqual([x.curso.aulas[1].id, semMatricula.produto.id]);

    await db.insert(s.criadores_grupos_membros).values({ criador_id: x.cr.id, grupo_id: grupo.id, membro_id: x.aluno.membro.id, modified_by: x.cr.id });
    expect((await res.vitrineDoAluno(x.qAluno)).fileiras.map((f) => f.titulo)).toContain("Só do grupo");
    // Equipe vê todas as fileiras visíveis (sem filtro de grupo) e as aulas sem matrícula.
    const daEquipe = await res.vitrineDoAluno(x.qAdmin);
    expect(daEquipe.fileiras.map((f) => f.id)).toEqual(["ment", "mais", "grupo", "man"]);
    expect(daEquipe.fileiras.at(-1)!.itens).toHaveLength(3);
  });

  it("CONTINUAR, NOVIDADES e o título com {nome}; destaque configurado com selo automático e botão sumido", async () => {
    const x = await cenario();
    await concluirAulas(x.cr.id, x.aluno, x.curso.aulas.slice(0, 1));
    const sumida = await cursoPronto(x.cr.id, { aulas: 1 });
    const config = base(x, {
      fileiras: [fileira("cont", "CONTINUAR", { titulo: "Continue, {nome}" }), fileira("novo", "NOVIDADES", { quantidade: 3 })],
    });
    config.destaque = { ...config.destaque, titulo: "Turma 2026", selo: null, botaoSecundario: { texto: "Aula", acao: "AULA", alvo: sumida.aulas[0].id } };
    const v = ok(await acoes.acaoSalvarRascunhoVitrine({ versao: null, config })).versao;
    ok(await acoes.acaoPublicarVitrine({ versao: v }));
    await db.update(s.produtos).set({ is_deleted: true, deleted_at: new Date() }).where(eq(s.produtos.id, sumida.produto.id));

    const vit = await res.vitrineDoAluno(x.qAluno);
    expect(vit.destaque).toMatchObject({ titulo: "Turma 2026", badge: "3 AULAS", botaoPrincipal: { texto: "Assistir", href: `/aula/${x.curso.aulas[1].id}` } });
    expect(vit.destaque!.botaoSecundario).toBeUndefined();
    expect(vit.fileiras.map((f) => f.titulo)).toEqual(["Fileira novo"]); // continuar vazio (só concluídas) some
    expect(vit.fileiras[0].itens.length).toBeLessThanOrEqual(3);
    const f = await res.resolverFileira(x.qAluno, fileira("c", "CONTINUAR", { titulo: "Continue, {nome}" }));
    expect(f.titulo).toBe("Continue, Ana");
  });

  it("sem config publicada = padrão (6 fileiras, destaque do curso); prévia só para a equipe", async () => {
    const x = await cenario();
    const vit = await res.vitrineDoAluno(x.qAluno);
    expect(vit.destaque?.titulo).toBe(x.curso.produto.titulo);
    expect(vit.fileiras.every((f) => cfg.FILEIRAS_PADRAO.some((p) => p.id === f.id))).toBe(true);
    const r = base(x, { fileiras: [fileira("ment", "MENTORIAS")] });
    await expect(res.previaDaVitrine(x.qAluno, r)).rejects.toThrow(/só para a equipe/);
    const pv = await res.previaDaVitrine(x.qAdmin, { ...r, destaque: { ...r.destaque, titulo: "Rascunho" } });
    expect(pv.destaque?.titulo).toBe("Rascunho");
    expect((await res.vitrineDoAluno(x.qAluno)).destaque?.titulo).toBe(x.curso.produto.titulo); // a prévia não publica
  });
});

describe("player lendo as flags publicadas", () => {
  it("abas, playlist, autoplay (com a preferência), velocidade, marcadores e aviso de certificado", async () => {
    const x = await cenario();
    await concluirAulas(x.cr.id, x.aluno, x.curso.aulas.slice(0, 1));
    const flags = { ...cfg.PLAYER_PADRAO, abas: { ...cfg.PLAYER_PADRAO.abas, comentarios: false }, playlist: false, velocidade: false, marcadores: false, avisoCertificado: true };
    const p = (await player.aulaParaPlayer(x.qAluno, x.curso.aulas[1].id, new Date(), flags))!;
    expect(p.flags).toMatchObject({ abas: { comentarios: false, descricao: true }, playlist: false, velocidade: false, marcadores: false, autoplay: true, aulasParaCertificado: 2 });
    await db.update(s.usuarios).set({ reproducao_automatica: false }).where(eq(s.usuarios.id, x.aluno.usuario.id));
    expect((await player.aulaParaPlayer(x.qAluno, x.curso.aulas[1].id, new Date(), flags))!.flags.autoplay).toBe(false);
    // Equipe não tem certificado a caminho; desligado = sem aviso.
    expect((await player.aulaParaPlayer(x.qAdmin, x.curso.aulas[1].id, new Date(), flags))!.flags.aulasParaCertificado).toBeNull();
    expect((await player.aulaParaPlayer(x.qAluno, x.curso.aulas[1].id))!.flags.aulasParaCertificado).toBeNull();
  });
});

describe("isolamento e permissão", () => {
  it("A×B: publicação de A não vale em B; B não reverte versão de A; ALUNO recusado", async () => {
    const a = await cenario();
    const v = ok(await acoes.acaoSalvarRascunhoVitrine({ versao: null, config: base(a, { fileiras: [] }) })).versao;
    ok(await acoes.acaoPublicarVitrine({ versao: v }));
    const b = await cenario();
    expect(await dados.publicadaAgora(b.cr.id)).toBeNull();
    expect(await acoes.acaoReverterVitrine({ versao: null, numero: 1 })).toMatchObject({ ok: false, erro: /Versão não encontrada/ });
    expect((await res.vitrineDoAluno(b.qAluno)).fileiras.length).toBeGreaterThanOrEqual(0);
    expect((await dados.publicadaAgora(a.cr.id))!.config.fileiras).toEqual([]);

    req.h = await cabecalhosLogados(a.aluno.usuario.email, a.cr.slug);
    for (const r of [
      await acoes.acaoSalvarRascunhoVitrine({ versao: null, config: base(a) }),
      await acoes.acaoPublicarVitrine({ versao: null }),
      await acoes.acaoReverterVitrine({ versao: null, numero: 1 }),
      await acoes.acaoDescartarRascunhoVitrine({ versao: null }),
      await acoes.acaoBuscarConteudoVitrine({ termo: "Curso" }),
    ])
      expect(r).toMatchObject({ ok: false, erro: /permissão/i });
  });
});
