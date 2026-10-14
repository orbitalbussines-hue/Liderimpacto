"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, StickyNote, Trash2 } from "lucide-react";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { AreaTexto } from "@/components/ui/area-texto";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { acaoCriarAnotacao, acaoEditarAnotacao, acaoRemoverAnotacao } from "@/lib/actions/anotacoes";
import { formatarTempo } from "@/lib/validators/catalogo";

export interface Anotacao {
  id: string;
  tempoSeg: number;
  texto: string;
  /** `updated_at` ISO (trava de colisão). */
  versao: string;
}

export interface AnotacoesAulaProps {
  aulaId: string;
  iniciais: readonly Anotacao[];
  /** Segundo atual do vídeo (rótulo "Anotar em 12:34"). */
  tempoAtual: number;
  /** Lê o tempo exato no clique. */
  capturarTempo: () => number;
  onIrPara: (seg: number) => void;
}

/** Igual a `TEXTO_ANOTACAO_MAX` (validators/progresso); a action confere de novo. */
const MAX = 2000;
const ordenar = (l: Anotacao[]) => [...l].sort((a, b) => a.tempoSeg - b.tempoSeg);

/**
 * Anotações com tempo (RN-120): criar no tempo atual do vídeo, lista por tempo, clicar no tempo
 * pula o vídeo, editar e remover com a trava de colisão (duas abas) e o modal block para remover.
 */
export function AnotacoesAula({ aulaId, iniciais, tempoAtual, capturarTempo, onIrPara }: AnotacoesAulaProps) {
  const [itens, setItens] = useState(() => ordenar([...iniciais]));
  const [nova, setNova] = useState<{ tempoSeg: number; texto: string } | null>(null);
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [removendo, setRemovendo] = useState<Anotacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const criar = () =>
    iniciar(async () => {
      if (!nova) return;
      const r = await acaoCriarAnotacao({ aulaId, tempoSeg: nova.tempoSeg, texto: nova.texto });
      if (!r.ok) return setErro(r.erro);
      setItens((l) => ordenar([...l, { id: r.dados.id, versao: r.dados.versao, tempoSeg: nova.tempoSeg, texto: nova.texto.trim() }]));
      setNova(null);
      setErro(null);
    });

  const salvarEdicao = (a: Anotacao) =>
    iniciar(async () => {
      if (!editando) return;
      const r = await acaoEditarAnotacao({ anotacaoId: a.id, versao: a.versao, texto: editando.texto });
      if (!r.ok) return setErro(r.erro);
      setItens((l) => l.map((x) => (x.id === a.id ? { ...x, texto: editando.texto.trim(), versao: r.dados.versao } : x)));
      setEditando(null);
      setErro(null);
    });

  const remover = () =>
    iniciar(async () => {
      if (!removendo) return;
      const r = await acaoRemoverAnotacao({ anotacaoId: removendo.id, versao: removendo.versao });
      if (!r.ok) {
        setErro(r.erro);
        setRemovendo(null);
        return;
      }
      setItens((l) => l.filter((x) => x.id !== removendo.id));
      setRemovendo(null);
      setErro(null);
    });

  return (
    <div className="flex max-w-[760px] flex-col gap-4">
      {nova ? (
        <form
          className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            criar();
          }}
        >
          <AreaTexto
            rotulo={`Anotação em ${formatarTempo(nova.tempoSeg)}`}
            value={nova.texto}
            onChange={(e) => setNova({ ...nova, texto: e.target.value })}
            maxLength={MAX}
            rows={3}
            autoFocus
            placeholder="O que você quer lembrar deste trecho?"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="40" carregando={pendente} disabled={!nova.texto.trim()}>
              Salvar anotação
            </Button>
            <Button type="button" variant="fantasma" size="40" onClick={() => setNova(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="secundario" size="42" className="self-start" onClick={() => setNova({ tempoSeg: Math.floor(capturarTempo()), texto: "" })}>
          <Plus aria-hidden />
          Anotar em <span className="tabular-nums">{formatarTempo(tempoAtual)}</span>
        </Button>
      )}

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {itens.length === 0 && !nova ? (
        <EstadoVazio comMoldura icone={<StickyNote />} titulo="Nenhuma anotação ainda" descricao="Anote ideias enquanto assiste: cada anotação guarda o momento do vídeo e leva você de volta a ele." />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Suas anotações">
          {itens.map((a) => (
            <li key={a.id} className="flex items-start gap-3 rounded-xl border border-border bg-surface px-3.5 py-3">
              <button
                type="button"
                onClick={() => onIrPara(a.tempoSeg)}
                aria-label={`Ir para ${formatarTempo(a.tempoSeg)} no vídeo`}
                className="mt-px inline-flex h-7 shrink-0 cursor-pointer items-center rounded-full bg-accent-soft px-2.5 text-xs font-bold text-accent tabular-nums hover:bg-accent hover:text-accent-ink"
              >
                {formatarTempo(a.tempoSeg)}
              </button>
              {editando?.id === a.id ? (
                <form
                  className="flex min-w-0 flex-1 flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    salvarEdicao(a);
                  }}
                >
                  <AreaTexto rotulo="Editar anotação" rotuloOculto value={editando.texto} onChange={(e) => setEditando({ id: a.id, texto: e.target.value })} maxLength={MAX} rows={3} autoFocus />
                  <div className="flex gap-2">
                    <Button type="submit" size="36" carregando={pendente} disabled={!editando.texto.trim()}>
                      Salvar
                    </Button>
                    <Button type="button" variant="fantasma" size="36" onClick={() => setEditando(null)}>
                      Cancelar
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="m-0 min-w-0 flex-1 pt-1 text-sm leading-relaxed break-words whitespace-pre-line">{a.texto}</p>
                  <div className="flex shrink-0 gap-0.5">
                    <Button type="button" variant="fantasma" size="icone44" className="desk:size-9" aria-label={`Editar anotação de ${formatarTempo(a.tempoSeg)}`} onClick={() => setEditando({ id: a.id, texto: a.texto })}>
                      <Pencil aria-hidden />
                    </Button>
                    <Button type="button" variant="fantasma" size="icone44" className="desk:size-9" aria-label={`Remover anotação de ${formatarTempo(a.tempoSeg)}`} onClick={() => setRemovendo(a)}>
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <ModalConfirmacaoBlock
        aberto={!!removendo}
        titulo="Remover anotação?"
        mensagem={removendo ? `A anotação em ${formatarTempo(removendo.tempoSeg)} (“${removendo.texto.slice(0, 80)}${removendo.texto.length > 80 ? "…" : ""}”) sai da sua lista.` : ""}
        onConfirmar={remover}
        onCancelar={() => setRemovendo(null)}
        carregando={pendente}
        textoConfirmar="Remover"
      />
    </div>
  );
}
