"use client";

import { Eye, EyeOff, Plus, Settings2 } from "lucide-react";
import { ListaOrdenavel } from "@/components/admin/lista-ordenavel";
import { MenuAdmin } from "@/components/admin/menu-admin";
import { Button } from "@/components/ui/button";
import { MAX_BLOCOS, ROTULO_BLOCO, TIPOS_BLOCO, type BlocoPagina, type TipoBloco } from "@/lib/paginas/config";
import { cn } from "@/lib/utils";

const ITEM = "flex w-full items-center gap-2 rounded-xl border p-2 text-left transition-colors duration-150";
const marcado = (sel: boolean) => (sel ? "border-accent bg-accent-soft" : "border-border bg-bg hover:bg-surface-2");

/** Resumo de uma linha do bloco (o primeiro texto que o identifica). */
function resumo(b: BlocoPagina): string {
  if ("titulo" in b && b.titulo) return b.titulo;
  if (b.tipo === "AUTOR") return b.nome;
  return ROTULO_BLOCO[b.tipo];
}

/** Coluna "Estrutura": configurações da página e os blocos (arrastar, subir/descer, ocultar, adicionar). */
export function EstruturaPagina({ blocos, selecionado, temFormulario, onSelecionar, onReordenar, onAlternarVisivel, onAdicionar }: {
  blocos: readonly BlocoPagina[];
  selecionado: string;
  temFormulario: boolean;
  onSelecionar: (id: string) => void;
  onReordenar: (b: BlocoPagina[]) => void;
  onAlternarVisivel: (id: string) => void;
  onAdicionar: (t: TipoBloco) => void;
}) {
  const itens = blocos.map((b) => ({ ...b, versao: "" }));
  return (
    <div className="flex flex-col gap-3">
      <h2 className="m-0 text-sm font-extrabold">Estrutura da página</h2>
      <button type="button" aria-pressed={selecionado === "pagina"} onClick={() => onSelecionar("pagina")} className={cn(ITEM, "p-3", marcado(selecionado === "pagina"))}>
        <Settings2 className="size-4 shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold">Página</span>
          <span className="block text-[11px] text-muted">Endereço, tema e buscadores</span>
        </span>
      </button>
      <h3 className="m-0 mt-1 text-xs font-bold text-muted">Blocos</h3>
      {blocos.length === 0 && <p className="m-0 text-xs text-muted">Nenhum bloco. Adicione o primeiro.</p>}
      <ListaOrdenavel
        itens={itens}
        rotulo={(b) => `bloco ${ROTULO_BLOCO[b.tipo]}`}
        onReordenar={(novos) => onReordenar(novos.map((n) => blocos.find((b) => b.id === n.id)!))}
        className="gap-2"
        renderItem={(b, { alca, subirDescer, arrastando }) => (
          <div className={cn(ITEM, "group gap-1 py-1.5 pr-1.5 pl-0.5", marcado(selecionado === b.id), !b.visivel && "opacity-55", arrastando && "shadow-card")}>
            {alca}
            <button type="button" aria-pressed={selecionado === b.id} onClick={() => onSelecionar(b.id)} className="min-w-0 flex-1 cursor-pointer py-1 text-left">
              <span className="block truncate text-[13px] font-bold">{ROTULO_BLOCO[b.tipo]}</span>
              <span className="block truncate text-[11px] text-muted">
                {resumo(b)}
                {!b.visivel && " · oculto"}
              </span>
            </button>
            <span className="flex shrink-0 items-center">
              <span className={cn("hidden group-focus-within:flex group-hover:flex", selecionado === b.id && "flex")}>{subirDescer}</span>
              <Button
                type="button"
                variant="fantasma"
                size="icone36"
                className="size-8 text-muted"
                aria-label={b.visivel ? `Ocultar ${ROTULO_BLOCO[b.tipo]}` : `Mostrar ${ROTULO_BLOCO[b.tipo]}`}
                aria-pressed={!b.visivel}
                onClick={() => onAlternarVisivel(b.id)}
              >
                {b.visivel ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
              </Button>
            </span>
          </div>
        )}
      />
      <MenuAdmin
        alinhar="start"
        gatilho={<Button type="button" variant="contorno" className="h-[42px] w-full border-dashed text-accent" disabled={blocos.length >= MAX_BLOCOS} />}
        itens={TIPOS_BLOCO.filter((t) => t !== "FORMULARIO" || !temFormulario).map((t) => ({ rotulo: ROTULO_BLOCO[t], onSelecionar: () => onAdicionar(t) }))}
      >
        <Plus aria-hidden />
        Adicionar bloco
      </MenuAdmin>
    </div>
  );
}
