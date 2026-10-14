"use client";

import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { CartaoTitulo } from "@/components/ui/cartao";
import { useAcoesEvento, type EventoAcionavel } from "./use-acoes-evento";

export interface SituacaoEventoProps {
  evento: EventoAcionavel;
  /** Linhas "Publicado em 14/10/26 · 10:00" já formatadas. */
  detalhes: string[];
  temLink: boolean;
}

const TEXTO: Record<EventoAcionavel["situacao"], string> = {
  RASCUNHO: "Só a equipe vê. Publique quando o link da sala estiver pronto: o público recebe um aviso no sino.",
  PUBLICADO: "Visível para o público. O link aparece para o aluno 15 minutos antes do início.",
  CANCELADO: "Cancelado. O aluno vê o encontro como cancelado, sem link.",
};

/** Painel lateral do editor: situação e as ações dela (publicar, cancelar, excluir rascunho). */
export function SituacaoEvento({ evento, detalhes, temLink }: SituacaoEventoProps) {
  const a = useAcoesEvento(evento, "/admin/eventos?aba=rascunhos");
  return (
    <div className="flex flex-col gap-3">
      <CartaoTitulo tamanho={15} como="h2">
        Situação
      </CartaoTitulo>
      <p className="m-0 text-[13px] leading-relaxed text-muted">{evento.encerrado && evento.situacao === "PUBLICADO" ? "Encerrado. Se houver gravação, o aluno vê “Assistir gravação”." : TEXTO[evento.situacao]}</p>
      {detalhes.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-muted">
          {detalhes.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      {a.podePublicar && !temLink && <p className="m-0 text-[13px] font-semibold text-text">Informe o link da sala e salve para poder publicar.</p>}
      {a.erro && <Aviso tom="erro">{a.erro}</Aviso>}
      {a.aviso && <Aviso tom="info">{a.aviso}</Aviso>}
      <div className="flex flex-wrap gap-2">
        {a.podePublicar && (
          <Button size="40" onClick={a.abrirPublicar} disabled={!temLink || a.pendente}>
            Publicar
          </Button>
        )}
        {a.podeCancelar && (
          <Button size="40" variant="contorno" onClick={a.abrirCancelar} disabled={a.pendente}>
            Cancelar encontro
          </Button>
        )}
        {a.podeExcluir && (
          <Button size="40" variant="fantasma" className="text-warn" onClick={a.abrirExcluir} disabled={a.pendente}>
            Excluir rascunho
          </Button>
        )}
      </div>
      {a.modais}
    </div>
  );
}
