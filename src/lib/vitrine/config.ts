import { z } from "zod";

/**
 * Configuração da vitrine (SISTEMA.md §4 `StorefrontConfig` + `StorefrontRow`; RN-135 a RN-138).
 * PURO: serve à action (valida o JSON que chega), ao servidor (resolve a vitrine) e à tela do
 * construtor (mesmas listas e rótulos). O JSON NUNCA entra no banco sem passar por
 * `configVitrineSchema` (`strictObject`: campo a mais = recusa).
 */

export const TIPOS_FILEIRA = ["CONTINUAR", "TOP10", "NOVIDADES", "TRILHAS", "MENTORIAS", "LISTA", "MANUAL"] as const;
export type TipoFileira = (typeof TIPOS_FILEIRA)[number];

export const QUANTIDADES_FILEIRA = [3, 5, 7, 10] as const;
export type QuantidadeFileira = (typeof QUANTIDADES_FILEIRA)[number];

export const ORDENACOES_FILEIRA = ["MANUAL", "RECENTES", "MAIS_ASSISTIDOS"] as const;
export type OrdenacaoFileira = (typeof ORDENACOES_FILEIRA)[number];

export const ACOES_BOTAO = ["CURSO", "AULA", "CONTINUAR", "LINK"] as const;
export type AcaoBotao = (typeof ACOES_BOTAO)[number];

export const ROTULO_TIPO_FILEIRA: Record<TipoFileira, string> = {
  CONTINUAR: "Continuar assistindo",
  TOP10: "Top 10",
  NOVIDADES: "Novidades",
  TRILHAS: "Trilhas",
  MENTORIAS: "Mentorias",
  LISTA: "Minha lista",
  MANUAL: "Escolha manual",
};

export const ROTULO_ORDENACAO: Record<OrdenacaoFileira, string> = { MANUAL: "Manual", RECENTES: "Mais recentes", MAIS_ASSISTIDOS: "Mais assistidos" };

export const ROTULO_ACAO: Record<AcaoBotao, string> = { CURSO: "Abrir curso", AULA: "Abrir aula", CONTINUAR: "Continuar de onde parou", LINK: "Link interno" };

/**
 * Ordenações que fazem sentido por tipo (a 1ª é a padrão). Só MENTORIAS tem escolha: as outras
 * têm uma ordem natural (Top 10 = mais vistas; Continuar/Novidades/Lista/Trilhas = mais recentes;
 * Manual = a ordem que a equipe montou).
 */
export const ORDENACOES_DO_TIPO: Record<TipoFileira, readonly OrdenacaoFileira[]> = {
  CONTINUAR: ["RECENTES"],
  TOP10: ["MAIS_ASSISTIDOS"],
  NOVIDADES: ["RECENTES"],
  TRILHAS: ["RECENTES"],
  MENTORIAS: ["RECENTES", "MAIS_ASSISTIDOS"],
  LISTA: ["RECENTES"],
  MANUAL: ["MANUAL"],
};

/** Marcador do primeiro nome do aluno no título da fileira ("Continue assistindo, {nome}"). */
export const MARCADOR_NOME = "{nome}";
export const tituloComNome = (titulo: string, nome: string) => titulo.replaceAll(MARCADOR_NOME, nome.trim().split(/\s+/)[0] ?? "").replace(/,\s*$/, "");

export const MAX_FILEIRAS = 20;
export const MAX_ITENS_MANUAIS = 10;

const uuid = z.uuid("Referência inválida.");
const texto = (rotulo: string, max: number, min = 0) =>
  z
    .string({ error: `${rotulo}: texto inválido.` })
    .trim()
    .min(min, `${rotulo}: obrigatório.`)
    .max(max, `${rotulo}: máximo de ${max} caracteres.`);

/** Caminho interno da própria área ("/trilhas", "/cursos/x"): sem protocolo, sem "//", sem espaço. */
export const RE_LINK_INTERNO = /^\/(?!\/)[A-Za-z0-9\-._~/?=&%#]*$/;

const botaoSchema = z
  .strictObject({
    texto: texto("Texto do botão", 30, 1),
    acao: z.enum(ACOES_BOTAO, { error: "Ação do botão inválida." }),
    /** CURSO e CONTINUAR: id do produto (CONTINUAR sem alvo = onde o aluno parou). AULA: id da aula. LINK: caminho interno. */
    alvo: z.string().trim().max(200, "Destino do botão muito longo.").nullable(),
  })
  .superRefine((b, ctx) => {
    const erro = (message: string) => ctx.addIssue({ code: "custom", message, path: ["alvo"] });
    if (b.acao === "LINK") {
      if (!b.alvo || !RE_LINK_INTERNO.test(b.alvo)) erro("Link: use um caminho interno que comece com / (ex.: /trilhas).");
    } else if (b.acao === "CONTINUAR") {
      if (b.alvo !== null && !uuid.safeParse(b.alvo).success) erro("Escolha o curso do botão.");
    } else if (!b.alvo || !uuid.safeParse(b.alvo).success) erro(b.acao === "AULA" ? "Escolha a aula do botão." : "Escolha o curso do botão.");
  });
export type BotaoDestaque = z.infer<typeof botaoSchema>;

export const destaqueSchema = z.strictObject({
  /** Arquivo IMAGEM do storage deste criador; nulo = capa 16:9 do curso em destaque. */
  imagemArquivoId: uuid.nullable(),
  /** Nulo = automático (nº de aulas do curso em destaque); "" = sem selo. */
  selo: texto("Selo", 20).nullable(),
  titulo: texto("Título do destaque", 80, 1),
  descricao: texto("Descrição do destaque", 300),
  botaoPrincipal: botaoSchema,
  botaoSecundario: botaoSchema.nullable(),
  mostrarAvisos: z.boolean(),
});
export type DestaqueVitrine = z.infer<typeof destaqueSchema>;

const itemManualSchema = z.strictObject({ tipo: z.enum(["PRODUTO", "AULA"], { error: "Item manual inválido." }), id: uuid });
export type ItemManual = z.infer<typeof itemManualSchema>;

export const fileiraSchema = z
  .strictObject({
    /** Estável entre edições e versões (seleção no construtor e na prévia). */
    id: z.string().regex(/^[a-z0-9_-]{1,40}$/, "Fileira inválida."),
    titulo: texto("Título da fileira", 60, 1),
    tipo: z.enum(TIPOS_FILEIRA, { error: "Tipo de fileira inválido." }),
    quantidade: z.literal(QUANTIDADES_FILEIRA, { error: "Quantidade: 3, 5, 7 ou 10." }),
    ordenacao: z.enum(ORDENACOES_FILEIRA, { error: "Ordenação inválida." }),
    /** Vazio = todos os alunos; senão, quem está em ao menos um destes grupos. */
    grupos: z.array(uuid).max(20, "No máximo 20 grupos por fileira."),
    visivel: z.boolean(),
    itensManuais: z.array(itemManualSchema).max(MAX_ITENS_MANUAIS, `No máximo ${MAX_ITENS_MANUAIS} itens escolhidos.`),
  })
  .superRefine((f, ctx) => {
    if (!ORDENACOES_DO_TIPO[f.tipo].includes(f.ordenacao)) ctx.addIssue({ code: "custom", message: "Ordenação não combina com o tipo da fileira.", path: ["ordenacao"] });
    if (f.tipo !== "MANUAL" && f.itensManuais.length) ctx.addIssue({ code: "custom", message: "Itens escolhidos só na fileira de escolha manual.", path: ["itensManuais"] });
    if (new Set(f.grupos).size !== f.grupos.length) ctx.addIssue({ code: "custom", message: "Grupo repetido na fileira.", path: ["grupos"] });
  });
export type FileiraVitrine = z.infer<typeof fileiraSchema>;

export const playerConfigSchema = z.strictObject({
  abas: z.strictObject({ descricao: z.boolean(), materiais: z.boolean(), comentarios: z.boolean(), anotacoes: z.boolean() }),
  playlist: z.boolean(),
  autoplay: z.boolean(),
  velocidade: z.boolean(),
  marcadores: z.boolean(),
  avisoCertificado: z.boolean(),
});
export type PlayerConfig = z.infer<typeof playerConfigSchema>;

export const configVitrineSchema = z
  .strictObject({
    destaque: destaqueSchema,
    fileiras: z.array(fileiraSchema).max(MAX_FILEIRAS, `No máximo ${MAX_FILEIRAS} fileiras.`),
    player: playerConfigSchema,
  })
  .superRefine((c, ctx) => {
    if (new Set(c.fileiras.map((f) => f.id)).size !== c.fileiras.length) ctx.addIssue({ code: "custom", message: "Fileira repetida.", path: ["fileiras"] });
  });
export type ConfigVitrine = z.infer<typeof configVitrineSchema>;

/** Player de hoje (o que valia antes do construtor): é o padrão sem configuração publicada. */
export const PLAYER_PADRAO: PlayerConfig = {
  abas: { descricao: true, materiais: true, comentarios: true, anotacoes: true },
  playlist: true,
  autoplay: true,
  velocidade: true,
  marcadores: true,
  avisoCertificado: false,
};

const fileiraPadrao = (id: string, tipo: TipoFileira, titulo: string): FileiraVitrine => ({
  id,
  titulo,
  tipo,
  quantidade: 10,
  ordenacao: ORDENACOES_DO_TIPO[tipo][0],
  grupos: [],
  visivel: true,
  itensManuais: [],
});

/** As 6 fileiras padrão (README tela 2), na ordem de hoje. */
export const FILEIRAS_PADRAO: readonly FileiraVitrine[] = [
  fileiraPadrao("continuar", "CONTINUAR", `Continue assistindo, ${MARCADOR_NOME}`),
  fileiraPadrao("top10", "TOP10", "Top 10 aulas da semana"),
  fileiraPadrao("novidades", "NOVIDADES", "Novidades na plataforma"),
  fileiraPadrao("trilhas", "TRILHAS", "Trilhas para você"),
  fileiraPadrao("mentorias", "MENTORIAS", "Mentorias gravadas"),
  fileiraPadrao("lista", "LISTA", "Minha lista"),
];

/** Curso principal do criador (para o rascunho inicial). Sem curso: destaque genérico com link. */
export interface CursoPrincipal {
  id: string;
  titulo: string;
  descricao: string | null;
}

/** Rascunho inicial = o que a vitrine mostra hoje, materializado (destaque do curso principal). */
export function configPadrao(curso: CursoPrincipal | null): ConfigVitrine {
  return {
    destaque: {
      imagemArquivoId: null,
      selo: null,
      titulo: curso?.titulo ?? "Bem-vindo",
      descricao: (curso?.descricao ?? "").slice(0, 300),
      botaoPrincipal: curso ? { texto: "Assistir", acao: "CONTINUAR", alvo: curso.id } : { texto: "Ver trilhas", acao: "LINK", alvo: "/trilhas" },
      botaoSecundario: curso ? { texto: "Mais informações", acao: "CURSO", alvo: curso.id } : null,
      mostrarAvisos: true,
    },
    fileiras: FILEIRAS_PADRAO.map((f) => ({ ...f })),
    player: { ...PLAYER_PADRAO, abas: { ...PLAYER_PADRAO.abas } },
  };
}

/** Fileira nova ("Adicionar fileira"): id curto aleatório e tipo Trilhas, como no protótipo. */
export function novaFileira(id: string): FileiraVitrine {
  return { ...fileiraPadrao(id, "TRILHAS", "Nova fileira"), quantidade: 5 };
}

/** Comparação semântica (ordem das chaves não importa; a das fileiras importa). */
function canonico(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonico);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonico((v as Record<string, unknown>)[k])]));
  return v;
}
export const mesmaConfig = (a: ConfigVitrine, b: ConfigVitrine) => JSON.stringify(canonico(a)) === JSON.stringify(canonico(b));

/**
 * Resumo legível do que mudou (trilha do autosave sem gravar o JSON inteiro a cada 800 ms, e o
 * resumo do modal de publicar). Ex.: `título do destaque: "A" → "B"; fileira "Top 10" alterada`.
 */
export function resumoDaMudanca(antes: ConfigVitrine, depois: ConfigVitrine): string {
  const partes: string[] = [];
  const curto = (v: unknown) => {
    const s = JSON.stringify(v) ?? "null";
    return s.length > 60 ? `${s.slice(0, 57)}...` : s;
  };
  const ROTULO: Record<keyof DestaqueVitrine, string> = {
    imagemArquivoId: "imagem",
    selo: "selo",
    titulo: "título",
    descricao: "descrição",
    botaoPrincipal: "botão principal",
    botaoSecundario: "botão secundário",
    mostrarAvisos: "avisos",
  };
  for (const k of Object.keys(ROTULO) as (keyof DestaqueVitrine)[]) {
    if (JSON.stringify(canonico(antes.destaque[k])) === JSON.stringify(canonico(depois.destaque[k]))) continue;
    const textual = k === "titulo" || k === "descricao" || k === "selo";
    partes.push(textual ? `${ROTULO[k]} do destaque: ${curto(antes.destaque[k])} → ${curto(depois.destaque[k])}` : `${ROTULO[k]} do destaque alterado`);
  }
  const idsAntes = antes.fileiras.map((f) => f.id);
  const idsDepois = depois.fileiras.map((f) => f.id);
  for (const f of depois.fileiras) {
    const a = antes.fileiras.find((x) => x.id === f.id);
    if (!a) partes.push(`fileira "${f.titulo}" adicionada`);
    else if (JSON.stringify(canonico(a)) !== JSON.stringify(canonico(f))) partes.push(`fileira "${f.titulo}" alterada`);
  }
  for (const a of antes.fileiras) if (!idsDepois.includes(a.id)) partes.push(`fileira "${a.titulo}" removida`);
  const comuns = (l: string[], outra: string[]) => l.filter((id) => outra.includes(id)).join();
  if (comuns(idsAntes, idsDepois) !== comuns(idsDepois, idsAntes)) partes.push("ordem das fileiras");
  if (JSON.stringify(canonico(antes.player)) !== JSON.stringify(canonico(depois.player))) partes.push("recursos do player");
  return partes.join("; ") || "sem mudança";
}

/** Fileira que a pessoa vê: visível e (sem grupos, ou equipe, ou em ao menos um dos grupos). */
export function fileiraParaQuem(f: FileiraVitrine, quem: { equipe: boolean; grupos: ReadonlySet<string> }): boolean {
  if (!f.visivel) return false;
  if (f.grupos.length === 0 || quem.equipe) return true;
  return f.grupos.some((g) => quem.grupos.has(g));
}

/** Ids referenciados pela config (a action confere que todos são DESTE criador). */
export function referenciasDaConfig(c: ConfigVitrine) {
  const produtos = new Set<string>();
  const aulas = new Set<string>();
  const grupos = new Set<string>();
  for (const b of [c.destaque.botaoPrincipal, c.destaque.botaoSecundario]) {
    if (!b?.alvo) continue;
    if (b.acao === "CURSO" || b.acao === "CONTINUAR") produtos.add(b.alvo);
    if (b.acao === "AULA") aulas.add(b.alvo);
  }
  for (const f of c.fileiras) {
    f.grupos.forEach((g) => grupos.add(g));
    for (const i of f.itensManuais) (i.tipo === "PRODUTO" ? produtos : aulas).add(i.id);
  }
  return { produtos: [...produtos], aulas: [...aulas], grupos: [...grupos], imagem: c.destaque.imagemArquivoId };
}
