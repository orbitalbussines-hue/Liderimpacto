"use client";

import { Eye, EyeOff, Image as IconeImagem, Plus } from "lucide-react";
import { ListaOrdenavel } from "@/components/admin/lista-ordenavel";
import { Button } from "@/components/ui/button";
import { IconeQuadrado } from "@/components/ui/icone-quadrado";
import { cn } from "@/lib/utils";
import { MAX_FILEIRAS, ROTULO_TIPO_FILEIRA, tituloComNome, type FileiraVitrine } from "@/lib/vitrine/config";

export interface EstruturaVitrineProps {
  fileiras: readonly FileiraVitrine[];
  selecionado: string;
  /** Primeiro nome de quem edita (no lugar de {nome} na lista). */
  nome: string;
  onSelecionar: (id: string) => void;
  onReordenar: (fileiras: FileiraVitrine[]) => void;
  onAlternarVisivel: (id: string) => void;
  onAdicionar: () => void;
}

const ITEM = "flex w-full items-center gap-2 rounded-xl border p-2 text-left transition-colors duration-150";
const marcado = (sel: boolean) => (sel ? "border-accent bg-accent-soft" : "border-border bg-bg hover:bg-surface-2");

/**
 * Coluna "Estrutura da página": o Destaque e as fileiras (arrastar com mouse, toque ou teclado;
 * subir/descer; ocultar). Clicar num item seleciona-o (propriedades à direita, contorno na prévia).
 */
export function EstruturaVitrine({ fileiras, selecionado, nome, onSelecionar, onReordenar, onAlternarVisivel, onAdicionar }: EstruturaVitrineProps) {
  const itens = fileiras.map((f) => ({ ...f, versao: "" }));
  const titulo = (f: FileiraVitrine) => tituloComNome(f.titulo, nome);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="m-0 text-sm font-extrabold">Estrutura da página</h2>
      <button type="button" aria-pressed={selecionado === "destaque"} onClick={() => onSelecionar("destaque")} className={cn(ITEM, "p-3", marcado(selecionado === "destaque"))}>
        <IconeQuadrado tamanho={32}>
          <IconeImagem aria-hidden />
        </IconeQuadrado>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold">Destaque</span>
          <span className="block text-[11px] text-muted">Imagem, título e botões</span>
        </span>
      </button>
      <h3 className="m-0 mt-1 text-[11px] font-bold tracking-[.1em] text-muted uppercase">Fileiras</h3>
      {fileiras.length === 0 && <p className="m-0 text-xs text-muted">Nenhuma fileira. Só o destaque aparece.</p>}
      <ListaOrdenavel
        itens={itens}
        rotulo={(f) => `fileira ${titulo(f)}`}
        onReordenar={(novos) => onReordenar(novos.map((n) => fileiras.find((f) => f.id === n.id)!))}
        className="gap-2"
        renderItem={(f, { alca, subirDescer, arrastando }) => (
          <div
            className={cn(ITEM, "group gap-1 py-1.5 pr-1.5 pl-0.5", marcado(selecionado === f.id), !f.visivel && "opacity-55", arrastando && "shadow-card")}
          >
            {alca}
            <button type="button" aria-pressed={selecionado === f.id} onClick={() => onSelecionar(f.id)} className="min-w-0 flex-1 cursor-pointer py-1 text-left">
              <span className="block truncate text-[13px] font-bold">{titulo(f)}</span>
              <span className="block truncate text-[11px] text-muted">
                {ROTULO_TIPO_FILEIRA[f.tipo]}
                {!f.visivel && " · oculta"}
              </span>
            </button>
            <span className="flex shrink-0 items-center">
              {/* Subir/descer aparecem no item selecionado, no hover e com o foco dentro (a alça já move pelo teclado). */}
              <span className={cn("hidden group-focus-within:flex group-hover:flex", selecionado === f.id && "flex")}>{subirDescer}</span>
              <Button
                type="button"
                variant="fantasma"
                size="icone36"
                className="size-8 text-muted"
                aria-label={f.visivel ? `Ocultar ${titulo(f)}` : `Mostrar ${titulo(f)}`}
                aria-pressed={!f.visivel}
                onClick={() => onAlternarVisivel(f.id)}
              >
                {f.visivel ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
              </Button>
            </span>
          </div>
        )}
      />
      <Button type="button" variant="contorno" className="h-[42px] border-dashed text-accent" disabled={fileiras.length >= MAX_FILEIRAS} onClick={onAdicionar}>
        <Plus aria-hidden />
        Adicionar fileira
      </Button>
    </div>
  );
}
