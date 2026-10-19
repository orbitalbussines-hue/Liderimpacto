"use client";

import { useEffect, useState } from "react";
import { CaixaSelecao } from "@/components/ui/caixa-selecao";
import { acaoContarPublico } from "@/lib/actions/campanhas";
import type { PublicoCampanha, PublicoLeads } from "@/lib/db/schema/marketing";
import { LEADS_TODOS, pessoas } from "./comum";

type Opcao = { id: string; nome: string };
export type OpcoesPublico = { grupos: readonly Opcao[]; tags: readonly Opcao[]; cursos: readonly Opcao[]; paginas: readonly Opcao[]; funis: readonly Opcao[] };
export type ContagemPublico = { total: number; descadastrados: number; receberao: number; membros: number; leads: number };

export interface SeletorPublicoProps {
  opcoes: OpcoesPublico;
  valor: PublicoCampanha;
  onMudar: (p: PublicoCampanha) => void;
  /** Contagem ao vivo (o editor usa no modal de envio). */
  onContagem: (c: ContagemPublico | null) => void;
}

type Chave = "grupoIds" | "tagIds" | "produtoIds";

function Lista({ titulo, itens, marcados, onAlternar }: { titulo: string; itens: readonly Opcao[]; marcados: readonly string[]; onAlternar: (id: string, ligado: boolean) => void }) {
  if (!itens.length) return null;
  return (
    <fieldset className="m-0 flex min-w-0 flex-col border-0 p-0">
      <legend className="mb-1 text-[13px] font-semibold">{titulo}</legend>
      {/* shrink-0 nos itens: sem ele a lista com max-h encolhe os rótulos até sumirem. */}
      <div className="flex max-h-40 flex-col overflow-y-auto">
        {itens.map((o) => (
          <CaixaSelecao key={o.id} className="min-h-9 min-w-0 shrink-0 text-text" rotulo={<span className="truncate">{o.nome}</span>} checked={marcados.includes(o.id)} onChange={(e) => onAlternar(o.id, e.target.checked)} />
        ))}
      </div>
    </fieldset>
  );
}

const alternarEm = (lista: readonly string[], id: string, ligado: boolean) => (ligado ? [...lista, id] : lista.filter((x) => x !== id));
const resumoDivisao = (c: ContagemPublico) =>
  [c.membros ? `${c.membros.toLocaleString("pt-BR")} ${c.membros === 1 ? "aluno" : "alunos"}` : null, c.leads ? `${c.leads.toLocaleString("pt-BR")} ${c.leads === 1 ? "lead" : "leads"}` : null].filter(Boolean).join(" e ");

/**
 * Público por segmento (RN-221, RN-250/251): ALUNOS (grupos, tags, cursos e "nunca acessou"; vários do
 * mesmo tipo = qualquer um; tipos diferentes = todos ao mesmo tempo) e/ou LEADS das páginas (página de
 * origem, funil, tag). Nada marcado num segmento = todos daquele segmento. Ninguém recebe duas vezes.
 */
export function SeletorPublico({ opcoes, valor, onMudar, onContagem }: SeletorPublicoProps) {
  const chave = JSON.stringify(valor);
  // Resultado guardado com a chave do filtro: filtro mudou = "Contando..." sem setState no efeito.
  const [lido, setLido] = useState<{ chave: string; contagem: ContagemPublico | null; erro: string | null } | null>(null);
  const atual = lido?.chave === chave ? lido : null;
  const contagem = atual?.contagem ?? null;
  const erro = atual?.erro ?? null;

  useEffect(() => {
    let valido = true;
    const t = setTimeout(async () => {
      const r = await acaoContarPublico({ publico: JSON.parse(chave) });
      if (!valido) return;
      setLido({ chave, contagem: r.ok ? r.dados : null, erro: r.ok ? null : r.erro });
      onContagem(r.ok ? r.dados : null);
    }, 300);
    return () => {
      valido = false;
      clearTimeout(t);
    };
  }, [chave, onContagem]);

  const mudar = (p: PublicoCampanha) => {
    onContagem(null);
    onMudar(p);
  };
  const membros = valor.membros ?? true;
  const leads = valor.leads ?? null;
  const alternar = (k: Chave) => (id: string, ligado: boolean) => mudar({ ...valor, [k]: alternarEm(valor[k], id, ligado) });
  const alternarLead = (k: keyof PublicoLeads) => (id: string, ligado: boolean) => {
    if (leads) mudar({ ...valor, leads: { ...leads, [k]: alternarEm(leads[k], id, ligado) } });
  };
  const filtrando = valor.grupoIds.length + valor.tagIds.length + valor.produtoIds.length > 0 || valor.nuncaAcessou;
  const filtrandoLeads = !!leads && leads.paginaIds.length + leads.funilIds.length + leads.tagIds.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[13px] text-muted">Marcar vários itens da mesma lista inclui quem está em qualquer um deles. Quem é aluno e também lead recebe uma vez só.</p>

      <section aria-label="Alunos" className="flex flex-col gap-3">
        <CaixaSelecao className="font-semibold text-text" rotulo="Alunos" checked={membros} onChange={(e) => mudar({ ...valor, membros: e.target.checked })} />
        {membros && (
          <div className="flex flex-col gap-3 pl-6">
            <p className="m-0 text-[13px] text-muted">{filtrando ? "Recebem os alunos que atendem a todos os filtros escolhidos." : "Sem filtro, vai para todos os alunos ativos."}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Lista titulo="Grupos" itens={opcoes.grupos} marcados={valor.grupoIds} onAlternar={alternar("grupoIds")} />
              <Lista titulo="Tags" itens={opcoes.tags} marcados={valor.tagIds} onAlternar={alternar("tagIds")} />
              <Lista titulo="Matriculados em" itens={opcoes.cursos} marcados={valor.produtoIds} onAlternar={alternar("produtoIds")} />
            </div>
            <CaixaSelecao className="text-text" rotulo="Só quem nunca acessou" checked={valor.nuncaAcessou} onChange={(e) => mudar({ ...valor, nuncaAcessou: e.target.checked })} />
          </div>
        )}
      </section>

      <section aria-label="Leads" className="flex flex-col gap-3 border-t border-border pt-4">
        <CaixaSelecao className="font-semibold text-text" rotulo="Leads das páginas" checked={!!leads} onChange={(e) => mudar({ ...valor, leads: e.target.checked ? LEADS_TODOS : null })} />
        {leads && (
          <div className="flex flex-col gap-3 pl-6">
            <p className="m-0 text-[13px] text-muted">
              {filtrandoLeads ? "Recebem os leads que atendem a todos os filtros escolhidos." : "Sem filtro, vai para todos os leads."} Lead que já virou aluno conta como aluno.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Lista titulo="Página de origem" itens={opcoes.paginas} marcados={leads.paginaIds} onAlternar={alternarLead("paginaIds")} />
              <Lista titulo="Funis" itens={opcoes.funis} marcados={leads.funilIds} onAlternar={alternarLead("funilIds")} />
              <Lista titulo="Tag do lead" itens={opcoes.tags} marcados={leads.tagIds} onAlternar={alternarLead("tagIds")} />
            </div>
          </div>
        )}
      </section>

      <div className="rounded-lg border border-border bg-bg px-3.5 py-3" aria-live="polite">
        {erro ? (
          <p className="m-0 text-[13px] text-warn">{erro}</p>
        ) : contagem === null ? (
          <p className="m-0 text-sm text-muted">Contando...</p>
        ) : (
          <>
            <p className="m-0 text-[15px] font-semibold tabular-nums">
              {contagem.receberao === 0 ? "Ninguém recebe com estes filtros" : `${pessoas(contagem.receberao)} ${contagem.receberao === 1 ? "recebe" : "recebem"} hoje`}
            </p>
            {contagem.receberao > 0 && <p className="m-0 mt-1 text-[13px] text-muted tabular-nums">{resumoDivisao(contagem)}</p>}
            {contagem.descadastrados > 0 && (
              <p className="m-0 mt-1 text-[13px] text-muted tabular-nums">
                {pessoas(contagem.descadastrados)} de {contagem.total.toLocaleString("pt-BR")} no filtro {contagem.descadastrados === 1 ? "se descadastrou e fica" : "se descadastraram e ficam"} de fora.
              </p>
            )}
            <p className="m-0 mt-1 text-xs text-muted">A lista é conferida de novo na hora do envio: quem entrar no filtro até lá também recebe.</p>
          </>
        )}
      </div>
    </div>
  );
}
