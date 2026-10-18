/**
 * Fase 1 (ADR-0018 item 8, RN-206) no PostgreSQL real — IA do Estúdio com o ClienteFalso (NUNCA a
 * API real): gera da transcrição, grava tokens e modelo, resposta fora do formato fica descartada e
 * conta no limite, aplicar por parte com trava da aula, perguntas viram questões só em avaliação do
 * MESMO curso, trilha e isolamento A×B.
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { novoCriador, novoUsuario } from "./_apoio";
import { avaliacaoPronta } from "./_passo7";
import { cursoPronto } from "./_progresso";

let s: typeof import("@/lib/db/schema");
let db: typeof import("@/lib/db").db;
let ia: typeof import("@/lib/estudio-ia/servico");
let Falso: typeof import("@/lib/assistente/cliente-falso").ClienteFalso;

beforeAll(async () => {
  s = await import("@/lib/db/schema");
  db = (await import("@/lib/db")).db;
  ia = await import("@/lib/estudio-ia/servico");
  Falso = (await import("@/lib/assistente/cliente-falso")).ClienteFalso;
});

const RESPOSTA = {
  descricao: "Nesta aula você aprende a dar feedback na rotina da equipe.",
  capitulos: [
    { inicioSeg: 0, titulo: "Abertura" },
    { inicioSeg: 60, titulo: "Na prática" },
  ],
  perguntas: [
    { enunciado: "Quando dar feedback?", opcoes: ["Nunca", "Na rotina", "Só no fim do ano", "Por e-mail"], correta: 1, explicacao: "A aula mostra o feedback na rotina." },
    { enunciado: "Feedback é sobre?", opcoes: ["Pessoa", "Comportamento", "Salário", "Cargo"], correta: 1, explicacao: "Sobre o comportamento observado." },
    { enunciado: "Qual o primeiro passo?", opcoes: ["Observar", "Punir", "Ignorar", "Elogiar sempre"], correta: 0, explicacao: "Observar antes." },
  ],
};

async function cenario() {
  const A = await novoCriador();
  const dono = await novoUsuario();
  const { produto, aulas } = await cursoPronto(A.id, { aulas: 1, duracao: 200 });
  const aula = aulas[0];
  const id = crypto.randomUUID();
  const chave = `criadores/${A.id}/legendas/${id}.vtt`;
  const falas = Array.from({ length: 40 }, (_, i) => `00:${String(Math.floor((i * 5) / 60)).padStart(2, "0")}:${String((i * 5) % 60).padStart(2, "0")}.000 --> 00:${String(Math.floor((i * 5 + 4) / 60)).padStart(2, "0")}:${String((i * 5 + 4) % 60).padStart(2, "0")}.000\nFala ${i} sobre feedback na rotina da equipe.\n`);
  const vtt = `WEBVTT\n\n${falas.join("\n")}`;
  const texto = Array.from({ length: 40 }, (_, i) => `Fala ${i} sobre feedback na rotina da equipe.`).join("\n");
  await db.insert(s.produtos_modulos_aulas_legendas).values({ id, criador_id: A.id, aula_id: aula.id, idioma: "pt-BR", rotulo: "Português", nome_original: "a.vtt", chave, texto, trechos: 40, duracao_seg: 200, enviado_por: dono.id, modified_by: dono.id });
  const armazenamento = await import("@/lib/armazenamento/cliente");
  const comStorage = await armazenamento
    .gravarObjeto({ bucket: "arquivos", criadorId: A.id, chave, corpo: Buffer.from(vtt), tamanho: Buffer.byteLength(vtt), mime: "text/vtt" })
    .then(() => true)
    .catch(() => false);
  return { A, dono, produto, aula, comStorage };
}

describe("IA do Estúdio", () => {
  it("gera da transcrição (dado escapado), guarda tokens/modelo e aplica descrição, capítulos e perguntas com trava", async () => {
    const x = await cenario();
    const cliente = new Falso({ resposta: `Claro!\n${JSON.stringify(RESPOSTA)}` });
    const g = await ia.gerarSugestao({ criadorId: x.A.id, autorId: x.dono.id, aulaId: x.aula.id }, cliente);
    expect(cliente.ultimoPedido?.mensagens[0].texto).toContain("Fala 0 sobre feedback");
    if (x.comStorage) expect(cliente.ultimoPedido?.mensagens[0].texto).toContain("[00:00]");
    const [lista] = await ia.sugestoesDaAula(x.A.id, x.aula.id);
    expect(lista).toMatchObject({ id: g.id, modelo: "claude-sonnet-5-5", descricao: RESPOSTA.descricao, perguntas: RESPOSTA.perguntas });
    expect(lista.tokensEntrada).toBeGreaterThan(0);
    expect(lista.custoUsd).toBeGreaterThan(0);
    // Sem o .vtt (storage fora), não há tempos confiáveis: capítulos descartados.
    expect(lista.capitulos).toEqual(x.comStorage ? RESPOSTA.capitulos : []);

    // Descrição: trava pela versão da AULA.
    await expect(db.transaction((tx) => ia.aplicarSugestao(tx, { criadorId: x.A.id, autor: x.dono.id, sugestaoId: g.id, versao: g.versao, parte: "DESCRICAO", aulaVersao: new Date(0) }))).rejects.toThrow(/alterado/);
    const d = await db.transaction((tx) => ia.aplicarSugestao(tx, { criadorId: x.A.id, autor: x.dono.id, sugestaoId: g.id, versao: g.versao, parte: "DESCRICAO", aulaVersao: x.aula.updated_at }));
    const [aula] = await db.select().from(s.produtos_modulos_aulas).where(eq(s.produtos_modulos_aulas.id, x.aula.id));
    expect(aula.descricao).toBe(RESPOSTA.descricao);
    expect(aula.updated_at.getTime()).toBe(d.aulaVersao!.getTime());
    // Versão velha da sugestão = colisão.
    await expect(db.transaction((tx) => ia.aplicarSugestao(tx, { criadorId: x.A.id, autor: x.dono.id, sugestaoId: g.id, versao: g.versao, parte: "DESCRICAO", aulaVersao: aula.updated_at }))).rejects.toThrow(/alterado/);

    let versao = d.versao;
    if (x.comStorage) {
      const c = await db.transaction((tx) => ia.aplicarSugestao(tx, { criadorId: x.A.id, autor: x.dono.id, sugestaoId: g.id, versao, parte: "CAPITULOS", aulaVersao: aula.updated_at }));
      const [a2] = await db.select().from(s.produtos_modulos_aulas).where(eq(s.produtos_modulos_aulas.id, x.aula.id));
      expect(a2.capitulos).toEqual(RESPOSTA.capitulos);
      versao = c.versao;
    }

    // Perguntas: só em avaliação do mesmo curso; entram no fim, como UNICA com gabarito.
    const outro = await cursoPronto(x.A.id, { aulas: 1 });
    const deOutro = await avaliacaoPronta(x.A.id, outro.produto.id);
    await expect(db.transaction((tx) => ia.aplicarSugestao(tx, { criadorId: x.A.id, autor: x.dono.id, sugestaoId: g.id, versao, parte: "PERGUNTAS", avaliacaoId: deOutro.avaliacao.id }))).rejects.toThrow(/neste curso/);
    const { avaliacao } = await avaliacaoPronta(x.A.id, x.produto.id);
    const p = await db.transaction((tx) => ia.aplicarSugestao(tx, { criadorId: x.A.id, autor: x.dono.id, sugestaoId: g.id, versao, parte: "PERGUNTAS", avaliacaoId: avaliacao.id, indices: [0, 2] }));
    expect(p.questoes).toBe(2);
    const qs = await db.select().from(s.produtos_avaliacoes_questoes).where(eq(s.produtos_avaliacoes_questoes.avaliacao_id, avaliacao.id));
    const novas = qs.filter((q) => q.ordem > 3).sort((a, b) => a.ordem - b.ordem);
    expect(novas.map((q) => [q.ordem, q.tipo, q.enunciado, q.gabarito])).toEqual([
      [4, "UNICA", "Quando dar feedback?", ["b"]],
      [5, "UNICA", "Qual o primeiro passo?", ["a"]],
    ]);
    const [final] = await db.select().from(s.produtos_modulos_aulas_sugestoes).where(eq(s.produtos_modulos_aulas_sugestoes.id, g.id));
    expect(final.descricao_aplicada_em).toBeInstanceOf(Date);
    expect(final.perguntas_aplicadas_em).toBeInstanceOf(Date);
    const trilha = await db.select().from(s.auditoria).where(eq(s.auditoria.registro_id, g.id));
    expect(trilha.map((t) => t.acao).sort()).toEqual(x.comStorage ? ["atualizar", "atualizar", "atualizar", "criar"] : ["atualizar", "atualizar", "criar"]);

    await db.transaction((tx) => ia.descartarSugestao(tx, { criadorId: x.A.id, autor: x.dono.id, sugestaoId: g.id, versao: p.versao }));
    expect(await ia.sugestoesDaAula(x.A.id, x.aula.id)).toEqual([]);
  });

  it("fora do formato: grava descartada (custo conta no limite) e recusa; sem chave, sem legenda e outro criador recusam", async () => {
    const x = await cenario();
    const antes = await ia.geracoesDeHoje(x.A.id);
    await expect(ia.gerarSugestao({ criadorId: x.A.id, autorId: x.dono.id, aulaId: x.aula.id }, new Falso({ resposta: "não sei responder em JSON" }))).rejects.toThrow(/formato inesperado/);
    expect(await ia.geracoesDeHoje(x.A.id)).toBe(antes + 1);
    expect(await ia.sugestoesDaAula(x.A.id, x.aula.id)).toEqual([]);
    await expect(ia.gerarSugestao({ criadorId: x.A.id, autorId: x.dono.id, aulaId: x.aula.id }, new Falso({ resposta: JSON.stringify(RESPOSTA), recusar: true }))).rejects.toThrow(/recusou/);
    await expect(ia.gerarSugestao({ criadorId: x.A.id, autorId: x.dono.id, aulaId: x.aula.id }, null)).rejects.toThrow("IA não configurada");
    await expect(ia.gerarSugestao({ criadorId: x.A.id, autorId: x.dono.id, aulaId: x.aula.id }, new Falso({ falhar: true }))).rejects.toThrow(/não respondeu/);

    const semLegenda = await cursoPronto(x.A.id, { aulas: 1 });
    await expect(ia.gerarSugestao({ criadorId: x.A.id, autorId: x.dono.id, aulaId: semLegenda.aulas[0].id }, new Falso())).rejects.toThrow(/legenda/);
    const B = await novoCriador();
    await expect(ia.gerarSugestao({ criadorId: B.id, autorId: x.dono.id, aulaId: x.aula.id }, new Falso())).rejects.toThrow("Aula não encontrada");
    expect(await ia.sugestoesDaAula(B.id, x.aula.id)).toEqual([]);

    // Limite do dia (contando as descartadas): completa até o teto e a próxima é recusada sem chamar o modelo.
    const faltam = 30 - (await ia.geracoesDeHoje(x.A.id));
    await db.insert(s.produtos_modulos_aulas_sugestoes).values(
      Array.from({ length: faltam }, () => ({ criador_id: x.A.id, aula_id: x.aula.id, descricao: "", capitulos: [], perguntas: [], modelo: "x", modified_by: x.dono.id })),
    );
    const cliente = new Falso({ resposta: JSON.stringify(RESPOSTA) });
    await expect(ia.gerarSugestao({ criadorId: x.A.id, autorId: x.dono.id, aulaId: x.aula.id }, cliente)).rejects.toThrow(/Limite de 30/);
    expect(cliente.chamadas).toBe(0);
  });
});
