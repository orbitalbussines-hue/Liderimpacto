import { IconeQuadrado } from "@/components/ui/icone-quadrado";

export interface AnexoMaterialProps {
  /** "PDF", "DOC"... */
  tipo: string;
  nome: string;
  /** Sem href, vira só um bloco informativo. */
  href?: string;
}

const CLASSE = "flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-3 text-[13px] font-semibold";

export function AnexoMaterial({ tipo, nome, href }: AnexoMaterialProps) {
  const conteudo = (
    <>
      <IconeQuadrado tamanho={32}>{tipo}</IconeQuadrado>
      {nome}
    </>
  );
  return href ? (
    <a href={href} className={`${CLASSE} hover:bg-surface-2`}>
      {conteudo}
    </a>
  ) : (
    <div className={CLASSE}>{conteudo}</div>
  );
}
