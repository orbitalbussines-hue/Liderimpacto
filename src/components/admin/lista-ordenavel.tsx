"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent, type UniqueIdentifier } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Resultado } from "@/lib/acao";
import { cn } from "@/lib/utils";

/** Item reordenável: `versao` = updated_at ISO (trava de colisão na action). */
export interface ItemOrdenavel {
  id: string;
  versao: string;
}

export interface ControlesOrdem {
  /** Alça de arrastar (mouse, toque e teclado: Espaço pega, setas movem, Espaço solta, Esc cancela). */
  alca: ReactNode;
  /** Botões subir/descer: alternativa sem arrastar. */
  subirDescer: ReactNode;
  arrastando: boolean;
}

export interface ListaOrdenavelProps<T extends ItemOrdenavel> {
  itens: readonly T[];
  /** Nome do item para leitor de tela ("Módulo Boas-vindas"). */
  rotulo: (item: T) => string;
  onReordenar: (novos: T[]) => void;
  desabilitado?: boolean;
  renderItem: (item: T, controles: ControlesOrdem) => ReactNode;
  className?: string;
}

function ItemArrastavel<T extends ItemOrdenavel>({
  item,
  indice,
  total,
  rotulo,
  desabilitado,
  mover,
  renderItem,
}: {
  item: T;
  indice: number;
  total: number;
  rotulo: string;
  desabilitado: boolean;
  mover: (de: number, para: number) => void;
  renderItem: ListaOrdenavelProps<T>["renderItem"];
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: desabilitado });
  const alca = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Arrastar ${rotulo}`}
      disabled={desabilitado}
      className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted outline-none hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-accent/40 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );
  const subirDescer = (
    <span className="flex shrink-0">
      <Button type="button" variant="fantasma" size="icone36" className="size-8 text-muted" aria-label={`Subir ${rotulo}`} disabled={desabilitado || indice === 0} onClick={() => mover(indice, indice - 1)}>
        <ArrowUp aria-hidden />
      </Button>
      <Button type="button" variant="fantasma" size="icone36" className="size-8 text-muted" aria-label={`Descer ${rotulo}`} disabled={desabilitado || indice === total - 1} onClick={() => mover(indice, indice + 1)}>
        <ArrowDown aria-hidden />
      </Button>
    </span>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("list-none", isDragging && "relative z-10 opacity-80")}
    >
      {renderItem(item, { alca, subirDescer, arrastando: isDragging })}
    </li>
  );
}

/**
 * Lista com arrastar e soltar acessível (dnd-kit) + botões subir/descer. Só apresenta e calcula a
 * nova ordem; quem usa persiste (veja `useOrdemPersistida`). Anúncios em PT-BR para leitor de tela.
 */
export function ListaOrdenavel<T extends ItemOrdenavel>({ itens, rotulo, onReordenar, desabilitado = false, renderItem, className }: ListaOrdenavelProps<T>) {
  const id = useId();
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const nome = (alvo: UniqueIdentifier) => {
    const item = itens.find((i) => i.id === alvo);
    return item ? rotulo(item) : "Item";
  };
  const posicao = (alvo: UniqueIdentifier) => itens.findIndex((i) => i.id === alvo) + 1;
  const anuncios: Announcements = {
    onDragStart: ({ active }) => `${nome(active.id)} pego, posição ${posicao(active.id)} de ${itens.length}.`,
    onDragOver: ({ active, over }) => (over ? `${nome(active.id)} sobre a posição ${posicao(over.id)} de ${itens.length}.` : `${nome(active.id)} fora da lista.`),
    onDragEnd: ({ active, over }) => (over ? `${nome(active.id)} solto na posição ${posicao(over.id)} de ${itens.length}.` : `${nome(active.id)} solto.`),
    onDragCancel: ({ active }) => `Movimento cancelado. ${nome(active.id)} voltou ao lugar.`,
  };
  const mover = (de: number, para: number) => {
    if (de === para || para < 0 || para >= itens.length) return;
    onReordenar(arrayMove([...itens], de, para));
  };
  const soltar = ({ active, over }: DragEndEvent) => {
    if (over) mover(posicao(active.id) - 1, posicao(over.id) - 1);
  };
  return (
    <DndContext
      id={id}
      sensors={sensores}
      collisionDetection={closestCenter}
      onDragEnd={soltar}
      accessibility={{
        announcements: anuncios,
        screenReaderInstructions: {
          draggable: "Para mover, pressione Espaço ou Enter, use as setas para cima e para baixo e pressione Espaço ou Enter de novo para soltar. Esc cancela.",
        },
      }}
    >
      <SortableContext items={itens.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ol className={cn("m-0 flex list-none flex-col p-0", className)}>
          {itens.map((item, i) => (
            <ItemArrastavel key={item.id} item={item} indice={i} total={itens.length} rotulo={rotulo(item)} desabilitado={desabilitado} mover={mover} renderItem={renderItem} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

/**
 * Estado local da ordem com gravação otimista: move na hora, chama a action com as versões e,
 * se der certo, todos ficam com a versão nova (dá para seguir arrastando sem recarregar). Falhou
 * (colisão): volta a ordem anterior e mostra o erro.
 */
export function useOrdemPersistida<T extends ItemOrdenavel>(inicial: readonly T[], salvar: (itens: ItemOrdenavel[]) => Promise<Resultado<{ versao: string }>>) {
  const [itens, setItens] = useState<T[]>([...inicial]);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const reordenar = (novos: T[]) => {
    const anterior = itens;
    setItens(novos);
    setErro(null);
    iniciar(async () => {
      const r = await salvar(novos.map(({ id, versao }) => ({ id, versao })));
      if (!r.ok) {
        setItens(anterior);
        setErro(r.erro);
        return;
      }
      setItens((atuais) => atuais.map((i) => ({ ...i, versao: r.dados.versao })));
    });
  };
  return { itens, reordenar, erro, pendente };
}
