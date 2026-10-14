import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { MIN_SENHA, problemaNaSenha } from "@/lib/validators/senha";

export type NivelSenha = "vazia" | "curta" | "recusada" | "aceita" | "longa";

/**
 * Nivel da senha para o medidor. Tudo deriva de MIN_SENHA e de problemaNaSenha (a MESMA regra
 * do servidor). `longa` (2x o minimo) e so incentivo, nao exigencia.
 */
export function nivelDaSenha(senha: string): NivelSenha {
  if (!senha) return "vazia";
  if (senha.length < MIN_SENHA) return "curta";
  if (problemaNaSenha(senha)) return "recusada";
  return senha.length >= MIN_SENHA * 2 ? "longa" : "aceita";
}

/** Largura (%) e cor de cada um dos 3 segmentos. */
function segmentos(nivel: NivelSenha, tamanho: number): [number, string][] {
  switch (nivel) {
    case "curta":
      return [[(tamanho / MIN_SENHA) * 100, "bg-muted"], [0, ""], [0, ""]];
    case "recusada":
      return [[100, "bg-warn"], [0, ""], [0, ""]];
    case "aceita":
      return [[100, "bg-accent"], [100, "bg-accent"], [0, ""]];
    case "longa":
      return [[100, "bg-ok"], [100, "bg-ok"], [100, "bg-ok"]];
    default:
      return [[0, ""], [0, ""], [0, ""]];
  }
}

function legenda(nivel: NivelSenha, senha: string): string {
  const faltam = MIN_SENHA - senha.length;
  switch (nivel) {
    case "curta":
      return faltam === 1 ? "Falta 1 caractere." : `Faltam ${faltam} caracteres.`;
    case "recusada":
      return problemaNaSenha(senha) ?? "";
    case "aceita":
      return "Atende ao mínimo. Uma frase mais longa deixa a senha ainda mais segura.";
    case "longa":
      return "Ótimo: frases longas são as senhas mais difíceis de adivinhar.";
    default:
      return `Use pelo menos ${MIN_SENHA} caracteres. Uma frase que só você conhece é fácil de lembrar e difícil de adivinhar.`;
  }
}

function Requisito({ ok, children }: { ok: boolean; children: string }) {
  return (
    <li className={cn("flex items-center gap-2 transition-colors duration-200", ok ? "text-text" : "text-muted")}>
      {ok ? <Check className="size-3.5 text-ok" aria-hidden /> : <Circle className="size-3 opacity-60" aria-hidden />}
      {children}
      <span className="sr-only">{ok ? " (atendido)" : " (pendente)"}</span>
    </li>
  );
}

/** Medidor + requisitos ao vivo da nova senha. Nome/e-mail da pessoa e vazamento: so o servidor confere. */
export function RequisitosSenha({ senha, id }: { senha: string; id?: string }) {
  const nivel = nivelDaSenha(senha);
  const tamanhoOk = senha.length >= MIN_SENHA;
  return (
    <div id={id} className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-1.5" aria-hidden>
        {segmentos(nivel, senha.length).map(([largura, cor], i) => (
          <div key={i} className="h-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className={cn("h-full rounded-full transition-[width,background-color] duration-300 ease-out", cor)}
              style={{ width: `${largura}%` }}
            />
          </div>
        ))}
      </div>
      <p role="status" className={cn("m-0 text-xs leading-relaxed", nivel === "recusada" ? "text-warn" : "text-muted")}>
        {legenda(nivel, senha)}
      </p>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-xs">
        <Requisito ok={tamanhoOk}>{`Pelo menos ${MIN_SENHA} caracteres`}</Requisito>
        <Requisito ok={tamanhoOk && nivel !== "recusada"}>Nada óbvio: sequência, senha comum ou nome da empresa</Requisito>
      </ul>
    </div>
  );
}
