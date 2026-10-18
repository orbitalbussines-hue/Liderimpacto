import type { IntervaloAssinatura, TipoOferta } from "@/lib/db/schema/_enums";

/** Dados resolvidos no servidor que os blocos mostram (PURO: render público, prévia e testes). */
export interface DadosRender {
  /** arquivoId → URL assinada (null = storage indisponível). */
  imagens: Record<string, string | null>;
  cursos: Record<string, { titulo: string; modulos: { id: string; titulo: string; aulas: string[] }[] }>;
  /** Só ofertas ATIVAS deste criador. */
  ofertas: Record<string, { id: string; nome: string; precoCentavos: number; tipo: TipoOferta; intervalo: IntervaloAssinatura | null }>;
}

/** Contexto da visita: links do botão de preço e do formulário. */
export interface ContextoRender {
  paginaId: string;
  /** Funil válido da visita (null = fora de funil). */
  funilId: string | null;
  /** Cupom e afiliado da URL já validados (repassados ao checkout e à próxima etapa). */
  cupom: string | null;
  afiliado: string | null;
  utm: Record<string, string>;
  /** Prévia da equipe: botões não abrem checkout nem gravam lead. */
  previa: boolean;
}
