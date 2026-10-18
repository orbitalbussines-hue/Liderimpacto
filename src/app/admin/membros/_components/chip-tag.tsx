import { Selo } from "@/components/ui/selo";

export interface TagVisivel {
  id: string;
  nome: string;
  /** `#rrggbb` (validado no servidor). */
  cor: string;
}

/** Tag de membro: rótulo neutro com a bolinha da cor (a cor nunca é o único sinal: o nome vem junto). */
export function ChipTag({ tag }: { tag: Pick<TagVisivel, "nome" | "cor"> }) {
  return (
    <Selo tom="neutro" forma="rotulo" className="max-w-full min-w-0 shrink gap-1.5">
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tag.cor }} />
      <span className="truncate">{tag.nome}</span>
    </Selo>
  );
}

/** Tags de uma linha da lista: a primeira + "+n", numa linha só (todos os nomes no title). */
export function TagsDaLinha({ tags }: { tags: readonly TagVisivel[] }) {
  if (!tags.length) return <span className="text-muted">—</span>;
  const resto = tags.length - 1;
  return (
    <div className="flex min-w-0 items-center gap-1" title={tags.map((t) => t.nome).join(", ")}>
      <ChipTag tag={tags[0]} />
      {resto > 0 && <span className="shrink-0 text-xs font-semibold text-muted">+{resto}</span>}
    </div>
  );
}
