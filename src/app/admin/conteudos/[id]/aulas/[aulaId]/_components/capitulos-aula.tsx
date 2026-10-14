"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { formatarTempo, lerTempo } from "@/lib/validators/catalogo";

export interface CapituloEditavel {
  /** Chave estável da linha na tela. */
  chave: string;
  tempo: string;
  titulo: string;
}

export interface CapitulosAulaProps {
  capitulos: CapituloEditavel[];
  onMudar: (capitulos: CapituloEditavel[]) => void;
  /** Duração do vídeo (quando já processado): limite dos tempos. */
  duracaoSeg: number | null;
}

let sequencia = 0;
export const novaChave = () => `cap-${++sequencia}`;

/** Erro da linha (tempo mm:ss, dentro da duração, sem repetir) ou null. */
export function erroDoCapitulo(c: CapituloEditavel, todos: readonly CapituloEditavel[], duracaoSeg: number | null): string | null {
  const seg = lerTempo(c.tempo);
  if (seg === null) return "Use mm:ss (ex.: 04:30).";
  if (duracaoSeg !== null && seg >= duracaoSeg) return `Passa da duração (${formatarTempo(duracaoSeg)}).`;
  if (todos.some((o) => o !== c && lerTempo(o.tempo) === seg)) return "Tempo repetido.";
  if (!c.titulo.trim()) return "Informe o título.";
  return null;
}

/** Lista editável de capítulos (tempo mm:ss + título). O servidor grava em ordem crescente de tempo. */
export function CapitulosAula({ capitulos, onMudar, duracaoSeg }: CapitulosAulaProps) {
  const mudar = (chave: string, campo: "tempo" | "titulo", valor: string) => onMudar(capitulos.map((c) => (c.chave === chave ? { ...c, [campo]: valor } : c)));
  return (
    <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
      <legend className="mb-1 text-[13px] font-semibold">Capítulos</legend>
      <p className="m-0 text-xs text-muted">
        Marcadores na barra do player. {duracaoSeg !== null ? `Duração do vídeo: ${formatarTempo(duracaoSeg)}.` : "A duração é conferida quando o vídeo for processado."}
      </p>
      {capitulos.map((c, i) => {
        const erro = erroDoCapitulo(c, capitulos, duracaoSeg);
        return (
          <div key={c.chave} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-start gap-2">
            <Campo
              rotulo={`Tempo do capítulo ${i + 1}`}
              rotuloOculto
              value={c.tempo}
              onChange={(e) => mudar(c.chave, "tempo", e.target.value)}
              placeholder="00:00"
              inputMode="numeric"
              maxLength={8}
              tamanho="42"
              className="font-mono tabular-nums"
              erro={erro && /mm:ss|duração|repetido/.test(erro) ? erro : undefined}
            />
            <Campo
              rotulo={`Título do capítulo ${i + 1}`}
              rotuloOculto
              value={c.titulo}
              onChange={(e) => mudar(c.chave, "titulo", e.target.value)}
              placeholder="Título do capítulo"
              maxLength={120}
              tamanho="42"
              erro={erro === "Informe o título." ? erro : undefined}
            />
            <Button type="button" variant="fantasma" size="icone44" className="size-[42px] text-muted" aria-label={`Remover capítulo ${i + 1}`} onClick={() => onMudar(capitulos.filter((x) => x.chave !== c.chave))}>
              <Trash2 aria-hidden />
            </Button>
          </div>
        );
      })}
      <Button type="button" variant="contorno" size="36" className="self-start" onClick={() => onMudar([...capitulos, { chave: novaChave(), tempo: "", titulo: "" }])}>
        <Plus className="size-3.5" aria-hidden />
        Adicionar capítulo
      </Button>
    </fieldset>
  );
}
