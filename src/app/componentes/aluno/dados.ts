/** Fixtures do protótipo (Sistema de Aulas Lider de Impacto v3) para o catálogo dos compostos do aluno. */
import type { AulaResumo, GrupoAulas, ModuloCurso } from "@/components/curso/tipos";
import type { DestaqueConfig, FileiraTipo, ItemFileira } from "@/components/vitrine/tipos";

const H = "#";

export const DESTAQUE: DestaqueConfig = {
  titulo: "Líder de Impacto",
  descricao:
    "Formação para líderes que influenciam, desenvolvem pessoas e geram resultados reais, com Valmer Albuquerque.",
  badge: "28 AULAS",
  meta: ["Curso", "Liderança", "2026", "9h 25"],
  botaoPrincipal: { texto: "Assistir", href: H },
  botaoSecundario: { texto: "Mais informações", href: H },
  avisos: {
    novidade: "Novo: módulo Cultura organizacional disponível",
    ranking: { selo: "TOP 1", texto: "Cursos da plataforma" },
  },
  mostrarAvisos: true,
};

const item = (id: string, titulo: string, subtitulo?: string, extra: Partial<ItemFileira> = {}): ItemFileira => ({
  id,
  titulo,
  subtitulo,
  href: H,
  ...extra,
});

export interface FileiraDemo {
  id: string;
  titulo: string;
  tag?: string;
  tipo: FileiraTipo;
  itens: ItemFileira[];
}

export const FILEIRAS: FileiraDemo[] = [
  {
    id: "continuar",
    titulo: "Continue assistindo, Valmer",
    tipo: "CONTINUAR",
    itens: [
      item("c1", "Cultura organizacional do líder", "Módulo 3 · Aula 2", { progresso: 42 }),
      item("c2", "Comunicação que influencia", "Módulo 2 · Aula 4", { progresso: 80 }),
      item("c3", "Como estruturar o seu projeto", "Editora Signature", { progresso: 15 }),
      item("c4", "Mentoria ao vivo #3", "Encontros 2026", { progresso: 60 }),
      item("c5", "Feedback que desenvolve", "Módulo 2 · Aula 2", { progresso: 95 }),
    ],
  },
  {
    id: "top10",
    titulo: "Top 10 aulas da semana",
    tag: "TOP 10",
    tipo: "TOP10",
    itens: [
      "Qual é o seu porquê?",
      "O primeiro fundamento da liderança",
      "Escuta ativa na liderança",
      "Cultura forte × cultura tóxica",
      "Delegação e autonomia",
      "Comece por aqui",
      "O que são os riscos",
    ].map((t, i) => item(`t${i}`, t)),
  },
  {
    id: "novidades",
    titulo: "Novidades na plataforma",
    tipo: "NOVIDADES",
    itens: [
      item("n1", "Avaliação final", "Líder de Impacto"),
      item("n2", "Módulo Cultura organizacional", "6 aulas"),
      item("n3", "Estrutura de escrita do capítulo", "Editora Signature"),
      item("n4", "Desafio: Semana da cultura", "Gamificação", { selo: "Em breve" }),
      item("n5", "Mentoria ao vivo · 30/09", "Terça · 20h", { selo: null }),
    ],
  },
  {
    id: "trilhas",
    titulo: "Trilhas para você",
    tipo: "TRILHAS",
    itens: [
      item("r1", "Do gestor ao líder de impacto", "5 etapas · 9h 25"),
      item("r2", "Escreva seu capítulo do livro", "3 etapas · 2h 10"),
      item("r3", "Liderança em tempos de crise", "4 etapas · 3h 40"),
      item("r4", "Comunicação de alto impacto", "4 etapas · 2h 50"),
      item("r5", "Gestão de pessoas na prática", "5 etapas · 4h 15"),
    ],
  },
  {
    id: "mentorias",
    titulo: "Mentorias gravadas",
    tipo: "MENTORIAS",
    itens: [
      item("m1", "Encontro 1 · Fundamentos", "1h 12"),
      item("m2", "Encontro 2 · Comunicação", "1h 05"),
      item("m3", "Encontro 3 · Cultura", "1h 20"),
      item("m4", "Encontro 4 · Legado", "58 min"),
      item("m5", "Perguntas e respostas", "45 min"),
    ],
  },
  {
    id: "lista",
    titulo: "Minha lista",
    tipo: "LISTA",
    itens: [
      item("l1", "Líder de Impacto", "Curso"),
      item("l2", "Editora Signature", "Curso"),
      item("l3", "Plano de desenvolvimento individual", "Aula"),
      item("l4", "Material complementar 3.2", "PDF"),
    ],
  },
];

export const CURSOS_CONTINUAR = [
  { id: "li", titulo: "Líder de Impacto", progresso: 42, feitas: 12, total: 28 },
  { id: "sig", titulo: "Editora Signature", progresso: 0, feitas: 0, total: 3 },
  { id: "live", titulo: "Encontros ao vivo 2026", progresso: 100, feitas: 4, total: 4 },
];

const aula = (id: string, titulo: string, duracao: string, estado: AulaResumo["estado"]): AulaResumo => ({
  id,
  titulo,
  duracao,
  estado,
  href: H,
});

const AULAS_M3: AulaResumo[] = [
  aula("3-1", "O que é cultura organizacional", "18 min", "concluida"),
  aula("3-2", "Cultura organizacional do líder", "22 min", "atual"),
  aula("3-3", "Cultura forte × cultura tóxica", "19 min", "pendente"),
  aula("3-4", "Qual é o papel do líder na criação da cultura", "24 min", "pendente"),
  aula("3-5", "O que são os riscos", "15 min", "pendente"),
  aula("3-6", "Material complementar", "8 min", "pendente"),
];

export const MODULOS: ModuloCurso[] = [
  { id: "1", numero: "01", titulo: "Fundamentos da liderança", totalAulas: 5, duracao: "1h 40", estado: "concluido", aulas: [] },
  { id: "2", numero: "02", titulo: "Comunicação dentro da liderança", totalAulas: 4, duracao: "1h 20", estado: "concluido", aulas: [] },
  { id: "3", numero: "03", titulo: "Cultura organizacional", totalAulas: 6, duracao: "2h 05", estado: "andamento", aulas: AULAS_M3 },
  { id: "4", numero: "04", titulo: "Desenvolvimento de pessoas", totalAulas: 5, duracao: "1h 50", estado: "bloqueado", aulas: [] },
  { id: "5", numero: "05", titulo: "Resultados e legado", totalAulas: 8, duracao: "2h 30", estado: "bloqueado", aulas: [] },
];

export const GRUPOS_PLAYLIST: GrupoAulas[] = [
  {
    id: "m2",
    titulo: "Módulo 02 · Comunicação dentro da liderança",
    aulas: [
      aula("2-1", "Escuta ativa na liderança", "20 min", "concluida"),
      aula("2-2", "Feedback que desenvolve", "22 min", "concluida"),
    ],
  },
  { id: "m3", titulo: "Módulo 03 · Cultura organizacional", aulas: AULAS_M3 },
  {
    id: "m4",
    titulo: "Módulo 04 · Desenvolvimento de pessoas",
    aulas: [
      aula("4-1", "Delegação e autonomia", "21 min", "pendente"),
      aula("4-2", "Plano de desenvolvimento individual", "25 min", "pendente"),
    ],
  },
];

export const CAPITULOS = [
  { titulo: "Introdução", atual: true },
  { titulo: "Os 3 sinais de uma cultura forte" },
  { titulo: "Plano de ação" },
];

export const AVALIACOES = [
  { id: "a1", titulo: "Autoavaliação de liderança", curso: "Líder de Impacto · Módulo 1", meta: "12 questões · 15 min", estado: "concluida", nota: 92 },
  { id: "a2", titulo: "Quiz · Cultura organizacional", curso: "Líder de Impacto · Módulo 3", meta: "8 questões · 10 min", estado: "disponivel" },
  { id: "a3", titulo: "Avaliação final", curso: "Líder de Impacto · Módulo 5", meta: "20 questões · 40 min · nota mínima 7", estado: "bloqueada", rotuloBloqueada: "Conclua os módulos" },
] as const;

export const TRILHAS = [
  { id: "t1", tag: "Trilha principal", titulo: "Do gestor ao líder de impacto", descricao: "Sequência completa da formação: fundamentos, comunicação, cultura, pessoas e legado.", totalEtapas: 5, etapasConcluidas: 2, duracao: "9h 25" },
  { id: "t2", tag: "Autoria", titulo: "Escreva seu capítulo do livro", descricao: "Da estrutura do projeto até a entrega editorial para a Editora Signature.", totalEtapas: 3, etapasConcluidas: 0, duracao: "2h 10" },
  { id: "t3", tag: "Mentoria", titulo: "Encontros ao vivo 2026", descricao: "Gravações e materiais das mentorias em grupo, na ordem em que aconteceram.", totalEtapas: 4, etapasConcluidas: 4, duracao: "6h 00" },
];

export const CERTIFICADOS = [
  { id: "c1", titulo: "Mentoria editorial", meta: "Emitido em 21/09/2026 · 3 aulas · 2h 10", bloqueado: false, progresso: 100 },
  { id: "c2", titulo: "Líder de Impacto", meta: "28 aulas · 9h 25 · avaliação final pendente", bloqueado: true, progresso: 42 },
  { id: "c3", titulo: "Encontros ao vivo 2026", meta: "Emitido em 02/09/2026 · 4 encontros", bloqueado: false, progresso: 100 },
];

export const POSTS = [
  { id: "p1", autor: "Edson Hideyuki Otani", quando: "há 15 dias", aula: "Comportamentos que impedem você de crescer", texto: "Estamos na Câmara procedendo atualização de sistemas, estão sendo analisados para serem contratados sistemas de gerenciamento via IA.", curtidas: 4, comentarios: 2 },
  { id: "p2", autor: "Edson Hideyuki Otani", quando: "há 15 dias", aula: "O primeiro fundamento da liderança", texto: "Na atualidade não sou líder, dai não tenho liderados, sou um dos liderados.", curtidas: 2, comentarios: 1 },
  { id: "p3", autor: "Ana Paula Pacheco", quando: "há um mês", aula: "Qual é o seu porquê?", texto: "Valmer, não consigo ver o PDF que falou das questões. Pode reenviar?", curtidas: 1, comentarios: 3 },
];

export const CANAIS = ["Home", "Dúvidas das aulas", "Autores · Signature", "Encontros ao vivo"].map((nome, i) => ({
  id: String(i),
  nome,
  href: H,
}));

export const MEMBROS_ATIVOS = [
  { nome: "Nayara Silveira", pontos: 520 },
  { nome: "Silvia Paulino", pontos: 410 },
  { nome: "Juliana Elias", pontos: 385 },
];

export const FIXADOS = [
  { rotulo: "Regras da comunidade", href: H },
  { rotulo: "Como enviar seu capítulo", href: H },
  { rotulo: "Calendário de mentorias", href: H },
];
