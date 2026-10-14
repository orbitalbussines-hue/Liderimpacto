"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { CampoBusca } from "@/components/ui/campo-busca";
import { acaoBuscarConteudoVitrine } from "@/lib/actions/vitrine";

export interface ConteudoEncontrado {
  tipo: "PRODUTO" | "AULA";
  id: string;
  titulo: string;
  detalhe: string;
}

/**
 * Busca de cursos e aulas deste criador (itens da fileira manual, aula do botão). Pesquisa 300 ms
 * depois de parar de digitar; `tipos` restringe (só aulas para o botão "Abrir aula").
 */
export function BuscaConteudo({ rotulo, tipos, ignorar = [], onEscolher }: { rotulo: string; tipos?: ConteudoEncontrado["tipo"][]; ignorar?: readonly string[]; onEscolher: (c: ConteudoEncontrado) => void }) {
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<{ termo: string; itens: ConteudoEncontrado[] }>({ termo: "", itens: [] });
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (termo.trim().length < 2) return;
    let vivo = true;
    const t = setTimeout(async () => {
      const r = await acaoBuscarConteudoVitrine({ termo });
      if (!vivo) return;
      setErro(r.ok ? null : r.erro);
      setAchados({ termo, itens: r.ok ? r.dados : [] });
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [termo]);

  const lista = termo.trim().length < 2 ? [] : achados.itens.filter((a) => (!tipos || tipos.includes(a.tipo)) && !ignorar.includes(a.id));
  return (
    <div className="flex flex-col gap-1.5">
      <CampoBusca rotulo={rotulo} placeholder="Busque pelo título do curso ou da aula" value={termo} onChange={(e) => setTermo(e.target.value)} fundo="bg" />
      {erro && <p className="m-0 text-xs font-semibold text-warn">{erro}</p>}
      {lista.length > 0 && (
        <ul className="m-0 flex max-h-56 list-none flex-col overflow-y-auto rounded-[10px] border border-border p-1">
          {lista.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onEscolher(c);
                  setTermo("");
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{c.titulo}</span>
                  <span className="block truncate text-[11px] text-muted">{c.detalhe}</span>
                </span>
                <Plus aria-hidden className="size-4 shrink-0 text-accent" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {termo.trim().length >= 2 && achados.termo === termo && lista.length === 0 && !erro && <p className="m-0 text-xs text-muted">Nada encontrado com “{termo.trim()}”.</p>}
    </div>
  );
}
