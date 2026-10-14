import { cn } from "@/lib/utils";
import { mesmaConfig, type ConfigVitrine } from "@/lib/vitrine/config";
import type { EstadoGravacao } from "./use-rascunho";

export type SituacaoVitrine = "publicado" | "alterado" | "padrao";

/**
 * O que o aluno vê × o rascunho (RN-137): igual à publicada = "Publicado"; nada publicado e igual
 * ao padrão = "Vitrine padrão"; qualquer diferença = "Alterações não publicadas".
 */
export function situacaoDoRascunho(rascunho: ConfigVitrine, publicada: ConfigVitrine | null, padrao: ConfigVitrine): SituacaoVitrine {
  if (publicada) return mesmaConfig(rascunho, publicada) ? "publicado" : "alterado";
  return mesmaConfig(rascunho, padrao) ? "padrao" : "alterado";
}

const TEXTO_GRAVACAO: Record<EstadoGravacao, string> = {
  salvo: "Rascunho salvo",
  pendente: "Editando…",
  salvando: "Salvando…",
  erro: "Não salvou",
  conflito: "Não salvou",
};

/** Indicador do cabeçalho: bolinha + situação (verde, dourado ou neutro) e o estado do autosave. */
export function StatusVitrine({ situacao, numero, gravacao }: { situacao: SituacaoVitrine; numero: number | null; gravacao: EstadoGravacao }) {
  const rotulo = situacao === "publicado" ? `Publicado${numero ? ` · versão ${numero}` : ""}` : situacao === "alterado" ? "Alterações não publicadas" : "Vitrine padrão";
  return (
    <span role="status" className="flex flex-col items-start gap-0.5 desk:items-end desk:text-right">
      <span className={cn("flex items-center gap-1.5 text-xs font-bold", situacao === "publicado" ? "text-ok" : situacao === "alterado" ? "text-accent" : "text-muted")}>
        <span aria-hidden className="size-2 rounded-full bg-current" />
        {rotulo}
      </span>
      <span className={cn("text-[11px]", gravacao === "erro" || gravacao === "conflito" ? "font-semibold text-warn" : "text-muted")}>{TEXTO_GRAVACAO[gravacao]}</span>
    </span>
  );
}
