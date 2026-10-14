"use client";

import { useState, useTransition } from "react";
import { Bell } from "lucide-react";
import { Abas } from "@/components/ui/abas";
import { Button } from "@/components/ui/button";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { acaoMaisNotificacoes } from "@/lib/actions/notificacoes";
import { ItemNotificacao, type ItemDaLista } from "./item-notificacao";
import { marcarTodas, marcarUma } from "./leitura";

export interface PaginaInicial {
  itens: ItemDaLista[];
  proximoCursor: string | null;
}

const FILTROS = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "nao-lidas", rotulo: "Não lidas" },
] as const;

/** Página `/notificacoes`: filtro Todas/Não lidas (sobre o que já carregou), "Carregar mais" por cursor, marcar todas. */
export function ListaCompleta({ inicial }: { inicial: PaginaInicial }) {
  const [itens, setItens] = useState(inicial.itens);
  const [cursor, setCursor] = useState(inicial.proximoCursor);
  const [filtro, setFiltro] = useState<string>("todas");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const visiveis = filtro === "nao-lidas" ? itens.filter((i) => !i.lida) : itens;
  const podeMarcar = cursor !== null || itens.some((i) => !i.lida);

  const carregarMais = () =>
    iniciar(async () => {
      setErro(null);
      const r = await acaoMaisNotificacoes({ cursor });
      if (!r.ok) return setErro(r.erro);
      setItens((atual) => [...atual, ...r.dados.itens.filter((n) => !atual.some((a) => a.id === n.id))]);
      setCursor(r.dados.proximoCursor);
    });
  const lerTodas = () =>
    iniciar(async () => {
      setErro(null);
      if (await marcarTodas()) setItens((atual) => atual.map((i) => ({ ...i, lida: true })));
      else setErro("Não foi possível marcar como lidas. Tente novamente.");
    });
  const lerUma = (item: ItemDaLista) => {
    if (item.lida) return;
    marcarUma(item.id);
    setItens((atual) => atual.map((i) => (i.id === item.id ? { ...i, lida: true } : i)));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Abas itens={FILTROS} ativo={filtro} onSelecionar={setFiltro} aria-label="Filtrar notificações" className="border-b-0" />
        {podeMarcar && (
          <Button variant="contorno" size="36" onClick={lerTodas} disabled={pendente}>
            Marcar todas como lidas
          </Button>
        )}
      </div>

      {erro && (
        <p role="alert" className="m-0 text-[13px] text-warn">
          {erro}
        </p>
      )}

      {visiveis.length === 0 ? (
        <EstadoVazio
          comMoldura
          icone={<Bell />}
          titulo={filtro === "nao-lidas" ? "Nada por ler" : "Nenhuma notificação ainda"}
          descricao={filtro === "nao-lidas" ? "Você está em dia com tudo." : "Curtidas, respostas e avisos das suas comunidades e cursos aparecem aqui."}
          className="py-16"
        />
      ) : (
        <ul className="m-0 flex max-w-[720px] list-none flex-col gap-0.5 rounded-2xl border border-border bg-surface p-1.5">
          {visiveis.map((i) => (
            <ItemNotificacao key={i.id} item={i} aoClicar={lerUma} />
          ))}
        </ul>
      )}

      {cursor && (
        <div>
          <Button variant="contorno" size="40" onClick={carregarMais} disabled={pendente} aria-busy={pendente}>
            {pendente ? "Carregando…" : "Carregar mais"}
          </Button>
        </div>
      )}
    </div>
  );
}
