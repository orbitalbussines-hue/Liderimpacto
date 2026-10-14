import { ExternalLink } from "lucide-react";
import { IconeQuadrado } from "@/components/ui/icone-quadrado";

export interface AnexoMaterialProps {
  /** "PDF", "DOC", "LINK"... */
  tipo: string;
  nome: string;
  /** Link direto (material do tipo LINK abre em outra aba). */
  href?: string;
  /** Arquivo: pede o link curto (`acaoLinkDoMaterial`) no clique. Exige componente client. */
  onAbrir?: () => void;
  carregando?: boolean;
  /** "2,4 MB" */
  detalhe?: string;
}

const CLASSE =
  "flex min-h-11 items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-3 text-left text-[13px] font-semibold";
const INTERATIVO = "cursor-pointer transition-colors duration-150 hover:bg-surface-2 aria-busy:cursor-progress aria-busy:opacity-70";

/** Anexo da aula (PDF/DOC/link): ícone com a sigla + nome. Sem `href`/`onAbrir`, só informativo. */
export function AnexoMaterial({ tipo, nome, href, onAbrir, carregando, detalhe }: AnexoMaterialProps) {
  const conteudo = (
    <>
      <IconeQuadrado tamanho={32}>{tipo === "LINK" ? <ExternalLink /> : tipo}</IconeQuadrado>
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{nome}</span>
        {detalhe && <span className="text-[11px] font-medium text-muted">{detalhe}</span>}
      </span>
    </>
  );
  if (href)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={`${CLASSE} ${INTERATIVO}`}>
        {conteudo}
        <span className="sr-only"> (abre em outra aba)</span>
      </a>
    );
  if (onAbrir)
    return (
      <button type="button" onClick={onAbrir} aria-busy={carregando || undefined} disabled={carregando} className={`${CLASSE} ${INTERATIVO}`}>
        {conteudo}
        <span className="sr-only"> (baixar)</span>
      </button>
    );
  return <div className={CLASSE}>{conteudo}</div>;
}
