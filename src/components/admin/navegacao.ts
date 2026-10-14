import {
  Activity, Award, Building2, Calendar, ClipboardList, Database, DollarSign, Download, FileText,
  Filter, FolderPlus, Globe, House, Inbox, LayoutGrid, LayoutTemplate, Link2, Mail, MessageSquare,
  Monitor, PanelsTopLeft, Percent, Palette, Plus, Rocket, Send, Settings, ShieldCheck, Smartphone,
  Sparkles, Tag, Trophy, Upload, Users, Video, Zap,
  type LucideIcon,
} from "lucide-react";
import type { Coluna } from "./tabela-tipos";

/** FONTE ÚNICA do admin: sidebar, rotas e moldes de página saem daqui. */

export type PapelAdmin = "ADMIN" | "DONO";

export interface AcaoPagina {
  rotulo: string;
  icone: LucideIcon;
  /** Com href, o botão vira link (tela própria de cadastro/importação). */
  href?: string;
}

export interface CartaoMolde {
  icone: LucideIcon;
  titulo: string;
  descricao: string;
  href?: string;
}

export type MoldeTabela = {
  tipo: "tabela";
  titulo: string;
  estatistica?: string;
  abas: string[];
  /** Placeholder da busca. */
  busca: string;
  /** Botões de filtro ("Tipo", "Situação"). */
  filtros: string[];
  colunas: Coluna[];
  acaoPrincipal?: AcaoPagina;
  acaoSecundaria?: AcaoPagina;
};

export type MoldeCards = {
  tipo: "cards";
  titulo: string;
  subtitulo: string;
  acao?: AcaoPagina;
  cards: CartaoMolde[];
};

export type Molde = MoldeTabela | MoldeCards | { tipo: "proprio" };

export interface ItemNavegacao {
  slug: string;
  rotulo: string;
  href: string;
  icone: LucideIcon;
  selo?: "Novo" | "Em breve";
  /** Fase do SISTEMA.md §3 em que a tela ganha dados reais. */
  fase: 1 | 2 | 3;
  papelMinimo: PapelAdmin;
  molde: Molde;
}

const ACOES_COL: Coluna = { titulo: "Ações", largura: 56 };

function item(
  slug: string,
  rotulo: string,
  icone: LucideIcon,
  fase: 1 | 2 | 3,
  molde: Molde,
  extras: Partial<Pick<ItemNavegacao, "selo" | "papelMinimo">> = {}
): ItemNavegacao {
  return {
    slug,
    rotulo,
    href: slug === "home" ? "/admin" : `/admin/${slug}`,
    icone,
    fase,
    papelMinimo: "ADMIN",
    molde,
    ...extras,
  };
}

const novo = (rotulo: string): AcaoPagina => ({ rotulo, icone: Plus });

function tabela(titulo: string, abas: string[], colunas: Coluna[], extras: Partial<MoldeTabela> = {}): Molde {
  return { tipo: "tabela", titulo, abas, busca: "Pesquisar...", filtros: [], colunas, ...extras };
}

export const GRUPOS_NAVEGACAO: { titulo: string; itens: ItemNavegacao[] }[] = [
  {
    titulo: "",
    itens: [
      item("home", "Home", House, 1, { tipo: "proprio" }),
      item("area-de-membros", "Área de membros", Monitor, 1, {
        tipo: "cards",
        titulo: "Área de membros",
        subtitulo: "Gerencie suas áreas de membros e turmas",
        acao: novo("Criar área de membros"),
        cards: [
          { icone: Monitor, titulo: "Principal", descricao: "Subplataforma principal · lideredeimpacto.com.br" },
          { icone: Users, titulo: "Turma Autores Signature", descricao: "Grupo de acesso · 69 membros" },
          { icone: LayoutTemplate, titulo: "Aparência", descricao: "Logo, cores, banner e templates de e-mail" },
          { icone: Trophy, titulo: "Gamificação", descricao: "Pontos, níveis e ranking por área" },
        ],
      }),
    ],
  },
  {
    titulo: "Educação",
    itens: [
      item(
        "conteudos", "Conteúdos", LayoutGrid, 1,
        tabela(
          "Gerenciar produtos",
          ["Produtos", "Materiais", "Trilhas", "Oferta", "Classificação"],
          [
            { titulo: "Capa", largura: 56 }, { titulo: "Título" }, { titulo: "Tipo", largura: 120 },
            { titulo: "Situação", largura: 120 }, { titulo: "Atualização", largura: 130 }, ACOES_COL,
          ],
          {
            busca: "Pesquise pelo título, categoria, tipo...",
            filtros: ["Tipo", "Situação"],
            acaoSecundaria: { rotulo: "Nova pasta", icone: FolderPlus },
            acaoPrincipal: novo("Novo produto"),
          }
        )
      ),
      item(
        "avaliacoes", "Avaliações", ClipboardList, 2,
        tabela(
          "Avaliações", ["Avaliações", "Banco de questões", "Auditoria"],
          [{ titulo: "Avaliação" }, { titulo: "Tipo", largura: 130 }, { titulo: "Status", largura: 120 }, { titulo: "Questões", largura: 90 }, { titulo: "Sessões", largura: 90 }, ACOES_COL],
          { acaoPrincipal: novo("Nova avaliação") }
        )
      ),
      item(
        "desafios", "Desafios", Rocket, 2,
        tabela(
          "Desafios", ["Desafios", "Ranking", "Recompensas"],
          [{ titulo: "Desafio" }, { titulo: "Período", largura: 140 }, { titulo: "Participantes", largura: 120 }, { titulo: "Status", largura: 120 }, ACOES_COL],
          { acaoPrincipal: novo("Novo desafio") }
        )
      ),
      item("construtor", "Construtor da vitrine", LayoutTemplate, 2, { tipo: "proprio" }, { selo: "Novo" }),
      item(
        "comunidade", "Comunidade", MessageSquare, 2,
        tabela(
          "Comunidade", ["Publicações", "Canais", "Moderação", "Dashboards"],
          [{ titulo: "Publicação" }, { titulo: "Autor", largura: 150 }, { titulo: "Curtidas", largura: 100 }, { titulo: "Comentários", largura: 110 }, { titulo: "Status", largura: 120 }, ACOES_COL],
          { acaoPrincipal: novo("Novo canal") }
        )
      ),
      item(
        "estudio-de-video", "Estúdio de vídeo", Video, 1,
        tabela(
          "Estúdio de vídeo", ["Vídeos", "Estatísticas", "IA"],
          [{ titulo: "Título" }, { titulo: "Status", largura: 110 }, { titulo: "Criação", largura: 120 }, { titulo: "IA", largura: 80 }, { titulo: "Atualização", largura: 120 }, ACOES_COL],
          { acaoPrincipal: { rotulo: "Upload", icone: Upload } }
        )
      ),
    ],
  },
  {
    titulo: "Inteligência artificial",
    itens: [
      item(
        "assistente-do-professor", "Assistente do professor", Sparkles, 3,
        {
          tipo: "cards",
          titulo: "Assistente do professor",
          subtitulo: "Um assistente que responde dúvidas dos alunos com base nas suas aulas",
          cards: [
            { icone: Sparkles, titulo: "Instruções", descricao: "Tom de voz e limites do assistente" },
            { icone: Video, titulo: "Aulas habilitadas", descricao: "Quais conteúdos ele pode consultar" },
            { icone: MessageSquare, titulo: "Conversas", descricao: "Histórico e perguntas sem resposta" },
          ],
        },
        { selo: "Novo" }
      ),
      item(
        "base-de-conhecimento", "Base de conhecimento", Database, 3,
        tabela(
          "Base de conhecimento", ["Documentos", "Fontes"],
          [{ titulo: "Documento" }, { titulo: "Origem", largura: 140 }, { titulo: "Status", largura: 120 }, { titulo: "Atualização", largura: 120 }, ACOES_COL],
          { acaoPrincipal: novo("Adicionar fonte") }
        ),
        { selo: "Novo" }
      ),
    ],
  },
  {
    titulo: "Marketing",
    itens: [
      item(
        "paginas", "Páginas", PanelsTopLeft, 3,
        tabela(
          "Páginas", ["Páginas", "Templates", "Domínios"],
          [{ titulo: "Página" }, { titulo: "URL", largura: 160 }, { titulo: "Status", largura: 120 }, { titulo: "Atualização", largura: 120 }, ACOES_COL],
          { acaoPrincipal: novo("Nova página") }
        )
      ),
      item(
        "funis", "Funis", Filter, 3,
        tabela(
          "Funis", ["Funis"],
          [{ titulo: "Funil" }, { titulo: "Etapas", largura: 100 }, { titulo: "Status", largura: 120 }, ACOES_COL],
          { acaoPrincipal: novo("Novo funil") }
        ),
        { selo: "Em breve" }
      ),
      item(
        "automacoes", "Automações", Zap, 3,
        tabela(
          "Automações", ["Automações", "Histórico"],
          [{ titulo: "Automação" }, { titulo: "Gatilho", largura: 180 }, { titulo: "Execuções", largura: 110 }, { titulo: "Status", largura: 110 }, ACOES_COL],
          { acaoPrincipal: novo("Nova automação") }
        )
      ),
      item(
        "campanhas", "Campanhas", Send, 3,
        tabela(
          "Campanhas", ["Campanhas", "Listas", "Modelos"],
          [{ titulo: "Campanha" }, { titulo: "Enviados", largura: 120 }, { titulo: "Abertura", largura: 110 }, { titulo: "Cliques", largura: 110 }, { titulo: "Status", largura: 110 }, ACOES_COL],
          { acaoPrincipal: novo("Nova campanha") }
        )
      ),
      item(
        "eventos", "Eventos", Calendar, 3,
        tabela(
          "Eventos", ["Eventos", "Acessos", "Termos de uso", "Registro de auditoria"],
          [{ titulo: "Usuário" }, { titulo: "Tipo", largura: 130 }, { titulo: "Entidade", largura: 160 }, { titulo: "Data", largura: 120 }, ACOES_COL],
          { acaoPrincipal: novo("Novo evento") }
        ),
        { selo: "Novo" }
      ),
    ],
  },
  {
    titulo: "Relatórios",
    itens: [
      item(
        "membros", "Membros", Users, 1,
        tabela(
          "Membros", ["Membros", "Grupos de acesso", "Vouchers", "Gamificação", "Tags"],
          [{ titulo: "Membro" }, { titulo: "Grupo", largura: 180 }, { titulo: "Matrículas", largura: 100 }, { titulo: "Criado em", largura: 110 }, { titulo: "Último acesso", largura: 120 }, ACOES_COL],
          {
            busca: "Pesquise por nome, e-mail, CPF ou tag...",
            filtros: ["Grupos", "+ Filtro"],
            acaoSecundaria: { rotulo: "Exportar", icone: Download },
            acaoPrincipal: novo("Cadastrar"),
          }
        )
      ),
      item(
        "matriculas", "Matrículas", Inbox, 1,
        tabela(
          "Matrículas", ["Matrículas", "Progresso", "Feedbacks de conteúdo", "Avaliações", "Correção"],
          [{ titulo: "Nome" }, { titulo: "Conteúdo", largura: 150 }, { titulo: "Iniciada", largura: 110 }, { titulo: "Concluída", largura: 110 }, { titulo: "Progresso", largura: 130 }, { titulo: "Situação", largura: 100 }, ACOES_COL],
          { acaoPrincipal: novo("Inscrever") }
        )
      ),
      item(
        "certificados", "Certificados", Award, 2,
        tabela(
          "Certificados", ["Certificados criados", "Emissão"],
          [{ titulo: "Certificado" }, { titulo: "Tipo", largura: 130 }, { titulo: "Produtos", largura: 160 }, { titulo: "Criado em", largura: 110 }, { titulo: "Emitidos", largura: 90 }, ACOES_COL],
          { acaoPrincipal: novo("Criar certificado") }
        )
      ),
      item(
        "analytics", "Analytics", Activity, 3,
        tabela(
          "Analytics", ["Dashboards", "Sessões", "Eventos"],
          [{ titulo: "Evento" }, { titulo: "Tipo", largura: 160 }, { titulo: "Ocorrências", largura: 120 }, { titulo: "Última", largura: 120 }, ACOES_COL],
          { acaoSecundaria: { rotulo: "Exportar", icone: Download } }
        )
      ),
      item(
        "vendas-e-financeiro", "Vendas e financeiro", DollarSign, 3,
        {
          tipo: "cards",
          titulo: "Vendas e financeiro",
          subtitulo: "Vendas, assinaturas e carteira financeira",
          acao: novo("Nova oferta"),
          cards: [
            { icone: DollarSign, titulo: "Vendas", descricao: "Gerencie as vendas da plataforma" },
            { icone: Inbox, titulo: "Assinaturas", descricao: "Gerencie as assinaturas recorrentes" },
            { icone: Activity, titulo: "Financeiro", descricao: "Saldo, saques e carteira" },
            { icone: Percent, titulo: "Meus afiliados", descricao: "Gerencie os afiliados e comissões" },
            { icone: Tag, titulo: "Ofertas e cupons", descricao: "Preços, parcelamento e descontos" },
            { icone: Link2, titulo: "Integrações", descricao: "Hotmart, Stripe, Pagar.me, Eduzz e webhooks" },
          ],
        },
        { papelMinimo: "DONO" }
      ),
    ],
  },
];

export const RODAPE_NAVEGACAO: ItemNavegacao[] = [
  item(
    "configuracoes", "Configurações", Settings, 1,
    {
      tipo: "cards",
      titulo: "Configurações da plataforma",
      subtitulo: "Assinatura, integrações e configurações gerais",
      acao: { rotulo: "Ver plano", icone: Plus },
      cards: [
        { icone: Settings, titulo: "Geral", descricao: "Nome, domínio padrão, SEO e habilitações" },
        { icone: Palette, titulo: "Aparência", descricao: "Cor da marca e tema da área do aluno", href: "/admin/configuracoes/aparencia" },
        { icone: Globe, titulo: "Domínios", descricao: "Conecte domínios próprios" },
        { icone: Mail, titulo: "Disparos de e-mails", descricao: "Logs, entregas e templates" },
        { icone: Smartphone, titulo: "Aplicativo", descricao: "App mobile da plataforma" },
        { icone: Upload, titulo: "Importação", descricao: "Upload em massa de membros e matrículas", href: "/admin/membros/importar" },
        { icone: FileText, titulo: "Logs", descricao: "Eventos administrativos e auditoria" },
        { icone: ShieldCheck, titulo: "Equipe e acesso", descricao: "Administradores e permissões" },
        { icone: Link2, titulo: "Integrações e webhooks", descricao: "Conectores e automações externas" },
      ],
    },
    { papelMinimo: "DONO" }
  ),
  item(
    "portal-do-cliente", "Portal do cliente", Building2, 3,
    {
      tipo: "cards",
      titulo: "Portal do cliente",
      subtitulo: "Plano, faturas e suporte da sua assinatura da plataforma",
      cards: [
        { icone: DollarSign, titulo: "Plano e faturas", descricao: "Assinatura da plataforma e histórico de cobrança" },
        { icone: MessageSquare, titulo: "Suporte", descricao: "Abra e acompanhe chamados" },
      ],
    },
    { papelMinimo: "DONO" }
  ),
];

export const TODOS_ITENS: ItemNavegacao[] = [...GRUPOS_NAVEGACAO.flatMap((g) => g.itens), ...RODAPE_NAVEGACAO];

/** Seção pelo slug (sem barra). Desconhecido -> null. */
export function secaoPorSlug(slug: string): ItemNavegacao | null {
  return TODOS_ITENS.find((i) => i.slug === slug) ?? null;
}

/** Item ativo para um pathname ("/admin" = Home; "/admin/membros/123" = Membros). */
export function itemAtivo(pathname: string): ItemNavegacao | null {
  const limpo = pathname.split(/[?#]/)[0].replace(/\/+$/, "");
  if (limpo === "/admin") return secaoPorSlug("home");
  const m = /^\/admin\/([^/]+)/.exec(limpo);
  return m ? secaoPorSlug(m[1]) : null;
}

/** DONO vê tudo; ADMIN só o que pede `ADMIN`. Regra única (sidebar e rota). */
export function papelPodeVer(papel: PapelAdmin, alvo: Pick<ItemNavegacao, "papelMinimo">): boolean {
  return papel === "DONO" || alvo.papelMinimo === "ADMIN";
}

/**
 * Seção que a rota genérica `/admin/[secao]` pode mostrar: existe, não é a Home
 * (tem rota própria) e o papel enxerga. Senão null -> 404.
 */
export function secaoAcessivel(slug: string, papel: PapelAdmin): ItemNavegacao | null {
  const s = secaoPorSlug(slug);
  return s && s.slug !== "home" && papelPodeVer(papel, s) ? s : null;
}
