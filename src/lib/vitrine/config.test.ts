import { describe, expect, it } from "vitest";
import { aplicarModeloModulos, configPadrao, configVitrineSchema, fileiraDeModulos, fileiraSchema, MAX_FILEIRAS, mesmaConfig, referenciasDaConfig, resumoDaMudanca } from "./config";

const CURSO = { id: "11111111-1111-4111-8111-111111111111", titulo: "Liderança na Prática", descricao: "Do bombeiro ao líder inteligente." };
const OUTRO = "22222222-2222-4222-8222-222222222222";

describe("fileira MODULOS (RN-271)", () => {
  it("JSON já publicado (sem cursoId) continua válido e igual a si mesmo", () => {
    const antigo = JSON.parse(JSON.stringify(configPadrao(CURSO)));
    const r = configVitrineSchema.safeParse(antigo);
    expect(r.success).toBe(true);
    expect(mesmaConfig(r.data!, antigo)).toBe(true);
  });

  it("MODULOS exige o curso; outro tipo recusa o campo", () => {
    const f = fileiraDeModulos("mods", CURSO.id);
    expect(fileiraSchema.safeParse(f).success).toBe(true);
    expect(f).toMatchObject({ tipo: "MODULOS", ordenacao: "MANUAL", titulo: "Módulos do curso" });
    const semCurso = fileiraSchema.safeParse({ ...f, cursoId: undefined });
    expect(semCurso.error?.issues[0]).toMatchObject({ path: ["cursoId"], message: "Escolha o curso da fileira de módulos." });
    expect(fileiraSchema.safeParse({ ...f, ordenacao: "RECENTES" }).success).toBe(false);
    const top10 = configPadrao(CURSO).fileiras[1];
    expect(fileiraSchema.safeParse({ ...top10, cursoId: CURSO.id }).error?.issues[0].message).toBe("Curso só na fileira de módulos do curso.");
  });

  it("o curso da fileira entra nas referências conferidas pela action", () => {
    const c = { ...configPadrao(null), fileiras: [fileiraDeModulos("mods", OUTRO)] };
    expect(referenciasDaConfig(c).produtos).toEqual([OUTRO]);
  });
});

describe("modelo Módulos do curso (RN-272)", () => {
  const base = configPadrao({ ...CURSO, id: OUTRO, titulo: "Outro curso" });

  it("troca o destaque pelo do curso, põe MODULOS no topo e mantém as outras fileiras", () => {
    const c = aplicarModeloModulos({ ...base, destaque: { ...base.destaque, mostrarAvisos: false } }, CURSO, "mods");
    expect(configVitrineSchema.safeParse(c).success).toBe(true);
    expect(c.destaque).toEqual({
      imagemArquivoId: null,
      selo: null,
      titulo: CURSO.titulo,
      descricao: CURSO.descricao,
      botaoPrincipal: { texto: "Continuar assistindo", acao: "CONTINUAR", alvo: CURSO.id },
      botaoSecundario: { texto: "Ver módulos", acao: "CURSO", alvo: CURSO.id },
      mostrarAvisos: false,
    });
    expect(c.fileiras.map((f) => f.id)).toEqual(["mods", ...base.fileiras.map((f) => f.id)]);
    expect(resumoDaMudanca(base, c)).toContain('fileira "Módulos do curso" adicionada');
  });

  it("aplicar de novo não duplica: a MODULOS do mesmo curso sobe para o topo e volta a ser visível", () => {
    const uma = aplicarModeloModulos(base, CURSO, "mods");
    const escondida = { ...uma, fileiras: [...uma.fileiras.slice(1), { ...uma.fileiras[0], visivel: false }] };
    const deNovo = aplicarModeloModulos(escondida, CURSO, "outra");
    expect(deNovo.fileiras.filter((f) => f.tipo === "MODULOS")).toHaveLength(1);
    expect(deNovo.fileiras[0]).toMatchObject({ id: "mods", visivel: true });
    expect(deNovo.fileiras).toHaveLength(uma.fileiras.length);
  });

  it("vitrine cheia: o modelo passaria do limite (a tela bloqueia antes)", () => {
    const cheia = { ...base, fileiras: Array.from({ length: MAX_FILEIRAS }, (_, i) => ({ ...base.fileiras[0], id: `f${i}` })) };
    expect(configVitrineSchema.safeParse(aplicarModeloModulos(cheia, CURSO, "mods")).success).toBe(false);
  });
});
