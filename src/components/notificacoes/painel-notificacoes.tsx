"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Esqueleto } from "@/components/ui/esqueleto";
import { acaoMaisNotificacoes } from "@/lib/actions/notificacoes";
import { ItemNotificacao, type ItemDaLista } from "./item-notificacao";
import { marcarTodas, marcarUma } from "./leitura";

type Estado = { fase: "carregando" } | { fase: "erro" } | { fase: "ok"; itens: ItemDaLista[] };

/** Conteúdo do popover: últimas notificações, "Marcar todas", "Ver todas". Monta ao abrir. */
export function PainelNotificacoes({ aoFechar }: { aoFechar: () => void }) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    void acaoMaisNotificacoes({ cursor: null }).then((r) => {
      if (ativo) setEstado(r.ok ? { fase: "ok", itens: r.dados.itens } : { fase: "erro" });
    });
    return () => {
      ativo = false;
    };
  }, [tentativa]);

  const itens = estado.fase === "ok" ? estado.itens : [];
  const temNaoLida = itens.some((i) => !i.lida);
  const lerUma = (item: ItemDaLista) => {
    if (!item.lida) {
      marcarUma(item.id);
      setEstado((e) => (e.fase === "ok" ? { fase: "ok", itens: e.itens.map((i) => (i.id === item.id ? { ...i, lida: true } : i)) } : e));
    }
    aoFechar();
  };
  const lerTodas = async () => {
    if (await marcarTodas()) setEstado((e) => (e.fase === "ok" ? { fase: "ok", itens: e.itens.map((i) => ({ ...i, lida: true })) } : e));
  };

  return (
    <>
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <Popover.Title className="m-0 flex-1 text-[15px] font-extrabold">Notificações</Popover.Title>
        {temNaoLida && (
          <Button variant="link" size="36" className="px-0 text-xs" onClick={lerTodas}>
            Marcar todas como lidas
          </Button>
        )}
        <Popover.Close render={<Button variant="fantasma" size="icone36" aria-label="Fechar notificações" className="-mr-2" />}>
          <X aria-hidden />
        </Popover.Close>
      </div>
      <div className="scrollbar-oculta max-h-[min(440px,60dvh)] overflow-y-auto px-1.5 pb-1.5">
        {estado.fase === "carregando" && (
          <div className="flex flex-col gap-3 p-3" aria-busy="true">
            <Esqueleto className="h-9 w-full" />
            <Esqueleto className="h-9 w-full" />
            <Esqueleto className="h-9 w-3/4" />
          </div>
        )}
        {estado.fase === "erro" && (
          <div role="alert" className="flex flex-col items-start gap-2 p-4 text-[13px] text-muted">
            Não foi possível carregar as notificações.
            <Button
              variant="contorno"
              size="36"
              onClick={() => {
                setEstado({ fase: "carregando" });
                setTentativa((t) => t + 1);
              }}
            >
              Tentar de novo
            </Button>
          </div>
        )}
        {estado.fase === "ok" && itens.length === 0 && <p className="m-0 px-4 py-8 text-center text-[13px] text-muted">Você não tem notificações.</p>}
        {itens.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {itens.map((i) => (
              <ItemNotificacao key={i.id} item={i} aoClicar={lerUma} />
            ))}
          </ul>
        )}
      </div>
      <Link href="/notificacoes" onClick={aoFechar} className="block border-t border-border px-4 py-3 text-center text-[13px] font-semibold text-accent hover:bg-surface-2">
        Ver todas
      </Link>
    </>
  );
}
