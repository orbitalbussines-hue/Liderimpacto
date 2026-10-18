"use client";

import { useState } from "react";
import { Copy, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { dataHora } from "./link-de-acesso";

export interface LinksPrimeiroAcessoProps {
  links: readonly { nome: string; email: string; url: string; expiraEm: string }[];
}

/** Aspas no padrão CSV (o nome pode ter vírgula). */
const celulaCsv = (v: string) => `"${v.replace(/"/g, '""')}"`;

/**
 * Links de primeiro acesso de uma importação: aparecem só no resultado, para copiar todos ou
 * baixar num CSV gerado AQUI no navegador (não ficam no servidor nem na URL).
 */
export function LinksPrimeiroAcesso({ links }: LinksPrimeiroAcessoProps) {
  const [copiado, setCopiado] = useState(false);
  if (links.length === 0) return null;
  const csvLinks = ["nome,email,link,valido_ate", ...links.map((l) => [l.nome, l.email, l.url, dataHora(l.expiraEm)].map(celulaCsv).join(","))].join("\n");
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[13px]">
        <b>{links.length} links de primeiro acesso</b> (uso único, válidos até {dataHora(links[0].expiraEm)}). Eles aparecem só agora: copie ou baixe antes
        de sair desta tela e entregue por canal privado.
      </p>
      <div className="flex flex-wrap gap-2.5">
        <Button
          size="40"
          onClick={async () => {
            await navigator.clipboard.writeText(csvLinks).then(() => setCopiado(true), () => setCopiado(false));
          }}
        >
          <Copy aria-hidden />
          {copiado ? "Copiado" : "Copiar todos"}
        </Button>
        <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${csvLinks}`)}`} download="links-primeiro-acesso.csv" className={buttonVariants({ variant: "contorno", size: "40" })}>
          <Download aria-hidden />
          Baixar CSV dos links
        </a>
      </div>
      <ul className="m-0 flex max-h-72 list-none flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-bg p-3 text-[13px]">
        {links.map((l) => (
          <li key={l.email} className="shrink-0 truncate">
            <b>{l.nome}</b> · <span className="text-muted">{l.email}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
