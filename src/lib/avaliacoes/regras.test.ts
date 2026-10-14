import { describe, expect, it } from "vitest";
import { questaoSchema } from "@/lib/validators/avaliacoes";
import { cardDaAvaliacao, corrigir, embaralhar, metaDaAvaliacao, montarOrdem, motivoDaAvaliacao, notaComUmaCasa, questaoCorreta, revelaGabarito, tentativasRestantes, type DadosDisponibilidade } from "./regras";

describe("correção (RN-124)", () => {
  const unica = { id: "q1", tipo: "UNICA", gabarito: ["b"], peso: 1 } as const;
  const multipla = { id: "q2", tipo: "MULTIPLA", gabarito: ["a", "c"], peso: 2 } as const;
  const vf = { id: "q3", tipo: "VERDADEIRO_FALSO", gabarito: ["a"], peso: 1 } as const;

  it("UNICA e V/F: só a opção do gabarito; duas marcadas = errada", () => {
    expect(questaoCorreta(unica, ["b"])).toBe(true);
    expect(questaoCorreta(unica, ["a"])).toBe(false);
    expect(questaoCorreta(unica, ["a", "b"])).toBe(false);
    expect(questaoCorreta(unica, [])).toBe(false);
    expect(questaoCorreta(unica, undefined)).toBe(false);
    expect(questaoCorreta(vf, ["a"])).toBe(true);
    expect(questaoCorreta(vf, ["b"])).toBe(false);
  });

  it("MULTIPLA pontua só o conjunto EXATO (faltar ou sobrar = errada)", () => {
    expect(questaoCorreta(multipla, ["c", "a"])).toBe(true);
    expect(questaoCorreta(multipla, ["a"])).toBe(false);
    expect(questaoCorreta(multipla, ["a", "b", "c"])).toBe(false);
  });

  it("nota ponderada pelos pesos, 1 casa, meio para cima, sem erro de ponto flutuante", () => {
    // certas: q1 (1) + q3 (1) = 2 de 4
    expect(corrigir([unica, multipla, vf], { q1: ["b"], q2: ["a"], q3: ["a"] })).toEqual({
      nota: 50,
      correcao: [
        { q: "q1", correta: true, peso: 1 },
        { q: "q2", correta: false, peso: 2 },
        { q: "q3", correta: true, peso: 1 },
      ],
    });
    expect(notaComUmaCasa(2, 3)).toBe(66.7);
    expect(notaComUmaCasa(1, 3)).toBe(33.3);
    expect(notaComUmaCasa(1, 8)).toBe(12.5);
    expect(notaComUmaCasa(1, 16)).toBe(6.3); // 6,25 -> 6,3
    expect(notaComUmaCasa(0, 0)).toBe(0);
    expect(corrigir([unica, multipla, vf], { q1: ["b"], q2: ["c", "a"], q3: ["a"] }).nota).toBe(100);
  });
});

describe("validação da questão (gabarito separado das opções)", () => {
  it("transforma em opcoes {id,texto} + gabarito [ids]; V/F com textos fixos", () => {
    const q = questaoSchema.parse({ tipo: "MULTIPLA", enunciado: "Quais?", opcoes: [{ texto: "A", correta: true }, { texto: "B", correta: false }, { texto: "C", correta: true }] });
    expect(q.opcoes).toEqual([{ id: "a", texto: "A" }, { id: "b", texto: "B" }, { id: "c", texto: "C" }]);
    expect(q.gabarito).toEqual(["a", "c"]);
    expect(JSON.stringify(q.opcoes)).not.toContain("correta");
    const vf = questaoSchema.parse({ tipo: "VERDADEIRO_FALSO", enunciado: "Céu é azul?", opcoes: [{ texto: "x", correta: false }, { texto: "y", correta: true }] });
    expect(vf.opcoes.map((o) => o.texto)).toEqual(["Verdadeiro", "Falso"]);
    expect(vf.gabarito).toEqual(["b"]);
  });

  it("recusa: sem correta, UNICA com 2 corretas, V/F com 3 opções, opção repetida, 1 opção", () => {
    const op = (t: string, c = false) => ({ texto: t, correta: c });
    expect(questaoSchema.safeParse({ tipo: "UNICA", enunciado: "abc", opcoes: [op("a"), op("b")] }).success).toBe(false);
    expect(questaoSchema.safeParse({ tipo: "UNICA", enunciado: "abc", opcoes: [op("a", true), op("b", true)] }).success).toBe(false);
    expect(questaoSchema.safeParse({ tipo: "VERDADEIRO_FALSO", enunciado: "abc", opcoes: [op("a", true), op("b"), op("c")] }).success).toBe(false);
    expect(questaoSchema.safeParse({ tipo: "MULTIPLA", enunciado: "abc", opcoes: [op("a", true), op("A")] }).success).toBe(false);
    expect(questaoSchema.safeParse({ tipo: "UNICA", enunciado: "abc", opcoes: [op("a", true)] }).success).toBe(false);
  });
});

describe("ordem sorteada", () => {
  it("sem sortear mantém a ordem; sorteando, mesma lista em outra ordem e V/F não troca opções", () => {
    const qs = [
      { id: "1", tipo: "UNICA" as const, opcoes: [{ id: "a" }, { id: "b" }, { id: "c" }] },
      { id: "2", tipo: "VERDADEIRO_FALSO" as const, opcoes: [{ id: "a" }, { id: "b" }] },
    ];
    expect(montarOrdem(qs, false)).toEqual([{ q: "1", o: ["a", "b", "c"] }, { q: "2", o: ["a", "b"] }]);
    const sorte = montarOrdem(qs, true, () => 0);
    expect(sorte.map((x) => x.q).sort()).toEqual(["1", "2"]);
    expect(sorte.find((x) => x.q === "2")!.o).toEqual(["a", "b"]);
    expect([...sorte.find((x) => x.q === "1")!.o].sort()).toEqual(["a", "b", "c"]);
    expect(embaralhar([1, 2, 3], () => 0)).toEqual([2, 3, 1]);
  });
});

describe("tentativas, gabarito e disponibilidade", () => {
  it("restantes: base + concessões − finalizadas; 0 = ilimitado (null)", () => {
    expect(tentativasRestantes(3, 0, 1)).toBe(2);
    expect(tentativasRestantes(3, 1, 3)).toBe(1);
    expect(tentativasRestantes(3, 0, 5)).toBe(0);
    expect(tentativasRestantes(0, 0, 99)).toBeNull();
  });

  it("PROVA esconde o gabarito enquanto der para tentar; QUIZ e SIMULADO mostram", () => {
    expect(revelaGabarito("PROVA", false, 2)).toBe(false);
    expect(revelaGabarito("PROVA", false, null)).toBe(false);
    expect(revelaGabarito("PROVA", false, 0)).toBe(true);
    expect(revelaGabarito("PROVA", true, 2)).toBe(true);
    expect(revelaGabarito("QUIZ", false, 2)).toBe(true);
    expect(revelaGabarito("SIMULADO", false, 2)).toBe(true);
  });

  const base: DadosDisponibilidade = {
    papel: "ALUNO",
    temVinculo: true,
    status: "PUBLICADA",
    statusProduto: "PUBLICADO",
    statusModulo: "PUBLICADO",
    matriculaValendo: true,
    moduloTravado: false,
    exigeAulasConcluidas: true,
    aulasPendentes: 0,
    temAberta: false,
    restantes: 2,
  };
  it("motivo na ordem: indisponível → matrícula → módulo → aulas → tentativas; aberta retoma", () => {
    expect(motivoDaAvaliacao(base)).toBeNull();
    expect(motivoDaAvaliacao({ ...base, status: "RASCUNHO" })).toBe("INDISPONIVEL");
    expect(motivoDaAvaliacao({ ...base, statusModulo: "RASCUNHO" })).toBe("INDISPONIVEL");
    expect(motivoDaAvaliacao({ ...base, temVinculo: false })).toBe("INDISPONIVEL");
    expect(motivoDaAvaliacao({ ...base, matriculaValendo: false, aulasPendentes: 3 })).toBe("MATRICULA");
    expect(motivoDaAvaliacao({ ...base, moduloTravado: true, aulasPendentes: 3 })).toBe("MODULO_BLOQUEADO");
    expect(motivoDaAvaliacao({ ...base, aulasPendentes: 3, restantes: 0 })).toBe("AULAS_PENDENTES");
    expect(motivoDaAvaliacao({ ...base, aulasPendentes: 3, exigeAulasConcluidas: false })).toBeNull();
    expect(motivoDaAvaliacao({ ...base, restantes: 0 })).toBe("TENTATIVAS_ESGOTADAS");
    expect(motivoDaAvaliacao({ ...base, restantes: 0, temAberta: true })).toBeNull();
    expect(motivoDaAvaliacao({ ...base, papel: "ADMIN", status: "RASCUNHO", matriculaValendo: false })).toBeNull();
  });

  it("card da tela 6 e meta", () => {
    expect(cardDaAvaliacao({ aprovada: true, melhorNota: 92, temAberta: false, motivo: null, tentou: true })).toMatchObject({ rotulo: "Concluída · 92%", cta: "Ver resultado" });
    expect(cardDaAvaliacao({ aprovada: false, melhorNota: null, temAberta: false, motivo: null, tentou: false })).toMatchObject({ situacao: "DISPONIVEL", cta: "Iniciar" });
    // aprovado refazendo: a tentativa aberta manda no card
    expect(cardDaAvaliacao({ aprovada: true, melhorNota: 92, temAberta: true, motivo: null, tentou: true })).toMatchObject({ situacao: "EM_ANDAMENTO", rotulo: "Em andamento · aprovado com 92%", cta: "Continuar" });
    expect(cardDaAvaliacao({ aprovada: false, melhorNota: null, temAberta: false, motivo: "AULAS_PENDENTES", tentou: false })).toMatchObject({
      situacao: "BLOQUEADA",
      rotulo: "Bloqueada · Conclua as aulas antes",
      cta: null,
    });
    expect(cardDaAvaliacao({ aprovada: false, melhorNota: 40.5, temAberta: false, motivo: null, tentou: true }).rotulo).toBe("Disponível · melhor nota 40,5%");
    expect(metaDaAvaliacao({ questoes: 10, tempoLimiteMin: 15, notaMinima: 70 })).toBe("10 questões · 15 min · nota mínima 70%");
    expect(metaDaAvaliacao({ questoes: 1, tempoLimiteMin: null, notaMinima: 60 })).toBe("1 questão · sem limite de tempo · nota mínima 60%");
  });
});
