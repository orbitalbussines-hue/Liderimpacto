import { Avatar } from "@/components/ui/avatar";
import { pontosPtBr } from "@/lib/gamificacao/regras";
import { cn } from "@/lib/utils";

export interface LinhaRankingAluno {
  posicao: number;
  membroId: string;
  nome: string;
  imagem: string | null;
  nivel: string;
  pontos: number;
}

export interface ListaRankingProps {
  linhas: readonly LinhaRankingAluno[];
  /** Membro da sessão (destacado). */
  meuId: string | null;
  /** A própria linha quando fica fora do top (aparece depois de um separador). */
  minhaForaDoTop: LinhaRankingAluno | null;
}

function Linha({ l, minha }: { l: LinhaRankingAluno; minha: boolean }) {
  return (
    <li
      aria-current={minha ? "true" : undefined}
      className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5", minha ? "bg-accent-soft" : "")}
    >
      <span className={cn("w-7 shrink-0 text-right text-sm font-extrabold tabular-nums", l.posicao <= 3 ? "text-accent" : "text-muted")}>{l.posicao}º</span>
      <Avatar nome={l.nome} src={l.imagem} tamanho={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {l.nome}
          {minha && <span className="font-normal text-muted"> (você)</span>}
        </span>
        <span className="block truncate text-xs text-muted">{l.nivel}</span>
      </span>
      <span className="shrink-0 text-sm font-bold tabular-nums">{pontosPtBr(l.pontos)}</span>
    </li>
  );
}

/** Ranking do período (top N + a própria posição, mesmo fora do top). Empate = mesma posição. */
export function ListaRanking({ linhas, meuId, minhaForaDoTop }: ListaRankingProps) {
  return (
    <ol aria-label="Ranking" className="m-0 flex list-none flex-col gap-0.5 p-0">
      {linhas.map((l) => (
        <Linha key={l.membroId} l={l} minha={l.membroId === meuId} />
      ))}
      {minhaForaDoTop && (
        <>
          <li aria-hidden className="px-3 py-1 text-center text-xs text-muted">
            ···
          </li>
          <Linha l={minhaForaDoTop} minha />
        </>
      )}
    </ol>
  );
}
