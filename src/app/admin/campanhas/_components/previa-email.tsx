"use client";

import { useMemo } from "react";
import type { ConteudoMarketing } from "@/lib/db/schema/marketing";
import { emailMarketing } from "@/lib/email/mensagens";
import type { Marca } from "@/lib/email/modelo";

export interface PreviaEmailProps {
  marca: Marca;
  conteudo: ConteudoMarketing;
  /** Nome da saudação ("Olá, Ana"). */
  nome: string;
  className?: string;
}

/**
 * Prévia com a MESMA montagem do e-mail que sai (`emailMarketing`), num iframe sem scripts. Link
 * inválido (ainda sendo digitado) faz a montagem recusar: a prévia avisa em vez de quebrar.
 */
export function PreviaEmail({ marca, conteudo, nome, className }: PreviaEmailProps) {
  const html = useMemo(() => {
    try {
      return emailMarketing(marca, { ...conteudo, botao: conteudo.botao?.texto && conteudo.botao.url ? conteudo.botao : null }, nome, { descadastro: `${marca.url}/descadastro` }).html;
    } catch {
      return null;
    }
  }, [marca, conteudo, nome]);

  return (
    <div className={className}>
      <div className="mb-2 min-w-0 text-[13px]">
        <div className="truncate font-semibold">{conteudo.assunto || "(sem assunto)"}</div>
        <div className="truncate text-xs text-muted">
          {marca.nome}
          {conteudo.previa && ` · ${conteudo.previa}`}
        </div>
      </div>
      {html ? (
        <iframe title="Prévia do e-mail" sandbox="" srcDoc={html} className="h-[560px] w-full rounded-lg border border-border bg-white" />
      ) : (
        <p className="m-0 rounded-lg border border-border bg-bg px-3.5 py-3 text-[13px] text-muted">Confira os links do texto e do botão: use endereços completos começando com https://.</p>
      )}
    </div>
  );
}
