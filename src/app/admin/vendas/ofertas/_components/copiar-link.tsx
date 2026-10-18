"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { MenuAdmin } from "@/components/admin/menu-admin";
import { Button } from "@/components/ui/button";

export interface LinkParaCopiar {
  /** Nome da oferta (item do menu). */
  rotulo: string;
  url: string;
}

/**
 * "Copiar link": um link = botão direto; vários (um por oferta: afiliado, cupom de todas) = menu.
 * O retorno vai num `role="status"` (leitor de tela) e no ícone por 2 s.
 */
export function CopiarLink({ links, descricao }: { links: readonly LinkParaCopiar[]; descricao: string }) {
  const [estado, setEstado] = useState<"parado" | "copiado" | "falhou">("parado");
  const copiar = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setEstado("copiado");
    } catch {
      setEstado("falhou");
    }
    setTimeout(() => setEstado("parado"), 2000);
  };
  if (links.length === 0) return <span className="text-xs text-muted">Sem oferta</span>;
  const icone = estado === "copiado" ? <Check className="size-3.5 text-ok" aria-hidden /> : <Copy className="size-3.5" aria-hidden />;
  const status = (
    <span role="status" className="sr-only">
      {estado === "copiado" ? "Link copiado" : estado === "falhou" ? "Não foi possível copiar" : ""}
    </span>
  );
  if (links.length === 1)
    return (
      <>
        <Button variant="contorno" size="36" aria-label={`Copiar ${descricao}`} title={links[0].url} onClick={() => copiar(links[0].url)}>
          {icone}
          {estado === "copiado" ? "Copiado" : "Copiar link"}
        </Button>
        {status}
      </>
    );
  return (
    <>
      <MenuAdmin
        alinhar="start"
        gatilho={<Button variant="contorno" size="36" aria-label={`Copiar ${descricao}: escolha a oferta`} />}
        itens={links.map((l) => ({ rotulo: l.rotulo, onSelecionar: () => copiar(l.url) }))}
      >
        {icone}
        {estado === "copiado" ? "Copiado" : "Copiar link"}
        <ChevronDown className="size-3.5 text-muted" aria-hidden />
      </MenuAdmin>
      {status}
    </>
  );
}
