/** Tipos da vitrine, espelhando `StorefrontConfig.hero` e `StorefrontRow` de docs/SISTEMA.md §4. */

export interface AcaoLink {
  texto: string;
  href: string;
}

export interface AvisosDestaque {
  /** Aviso de novidade (ícone de megafone). */
  novidade?: string;
  /** Selo + texto de ranking ("TOP 1" · "Cursos da plataforma"). */
  ranking?: { selo: string; texto: string };
}

export interface DestaqueConfig {
  titulo: string;
  descricao: string;
  imagemUrl?: string;
  /** Selo sólido ao fim da linha meta ("28 aulas"). */
  badge?: string;
  /** Itens da linha meta, separados por "•" ("Curso", "Liderança", "2026"). */
  meta: string[];
  /** Sem botão: o alvo configurado sumiu ou o aluno não o vê (construtor, RN-136). */
  botaoPrincipal?: AcaoLink;
  botaoSecundario?: AcaoLink;
  avisos?: AvisosDestaque;
  /** Só desktop, e só se houver `avisos`. */
  mostrarAvisos: boolean;
}

export type FileiraTipo = "CONTINUAR" | "TOP10" | "NOVIDADES" | "TRILHAS" | "MENTORIAS" | "LISTA" | "MANUAL";

export type VarianteCartao = "padrao" | "progresso" | "top10" | "novo";

/** Tipo da fileira do construtor -> visual do cartão. */
export function varianteDoTipo(tipo: FileiraTipo): VarianteCartao {
  if (tipo === "CONTINUAR") return "progresso";
  if (tipo === "TOP10") return "top10";
  if (tipo === "NOVIDADES") return "novo";
  return "padrao";
}

export interface ItemFileira {
  id: string;
  titulo: string;
  subtitulo?: string;
  imagemUrl?: string;
  href: string;
  /** 0 a 100 (variante progresso). */
  progresso?: number;
  /** Selo do canto (variante novo). Padrão "Novo"; `null` suprime. */
  selo?: string | null;
}
