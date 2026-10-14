"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ClipboardList, PlayCircle, Plus, Trash2 } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { ListaOrdenavel, useOrdemPersistida, type ControlesOrdem } from "@/components/admin/lista-ordenavel";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { CampoMoldura } from "@/components/ui/campo-moldura";
import { CartaoTitulo } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { Interruptor } from "@/components/ui/interruptor";
import { Selecao } from "@/components/ui/selecao";
import { Selo } from "@/components/ui/selo";
import type { Resultado } from "@/lib/acao";
import { acaoAdicionarItemTrilha, acaoRemoverItemTrilha, acaoReordenarItensTrilha, acaoSalvarItemTrilha } from "@/lib/actions/trilhas";
import type { TipoItemTrilha } from "@/lib/db/schema/_enums";

export interface ItemDaTrilha {
  id: string;
  versao: string;
  tipo: TipoItemTrilha;
  titulo: string;
  exigeAnterior: boolean;
  /** Alvo fora do ar para o aluno (curso em rascunho, avaliação em rascunho). */
  alvoEmRascunho: boolean;
}

export interface OpcoesDeEtapa {
  /** Cursos fora do rascunho. */
  produtos: { id: string; titulo: string }[];
  /** Avaliações publicadas: rótulo "Título · Curso". */
  avaliacoes: { id: string; titulo: string }[];
  /** Alvos já na trilha (não aparecem para adicionar). */
  usados: string[];
}

function useRodar() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (acao: () => Promise<Resultado<unknown>>, aoConcluir?: () => void) =>
    iniciar(async () => {
      setErro(null);
      const r = await acao().catch(() => null);
      if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
      if (!r.ok) return setErro(r.erro);
      aoConcluir?.();
      router.refresh();
    });
  return { erro, setErro, pendente, rodar };
}

function LinhaItem({ item, numero, controles }: { item: ItemDaTrilha; numero: number; controles: ControlesOrdem }) {
  const [removendo, setRemovendo] = useState(false);
  const { erro, pendente, rodar } = useRodar();
  const avaliacao = item.tipo === "AVALIACAO";
  return (
    <div className="flex flex-col gap-1 border-t border-border py-2 first:border-t-0">
      <div className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1.5 pr-1 pl-1">
        {controles.alca}
        <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-border text-[11px] font-extrabold text-muted tabular-nums">{numero}</span>
        {avaliacao ? <ClipboardList className="size-4 shrink-0 text-muted" aria-hidden /> : <PlayCircle className="size-4 shrink-0 text-muted" aria-hidden />}
        <div className="min-w-[160px] flex-1">
          <div className="truncate text-sm font-semibold">{item.titulo}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {avaliacao ? "Avaliação" : "Curso"}
            {item.alvoEmRascunho && <Selo tom="neutro">Em rascunho · o aluno não vê</Selo>}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {numero > 1 && (
            <div className="flex items-center gap-2 text-xs font-semibold text-muted">
              <span id={`exige-${item.id}`}>Exige a anterior</span>
              <Interruptor
                aria-labelledby={`exige-${item.id}`}
                ligado={item.exigeAnterior}
                disabled={pendente}
                onAlternar={(v) => rodar(() => acaoSalvarItemTrilha({ itemId: item.id, versao: item.versao, exigeAnterior: v }))}
              />
            </div>
          )}
          {controles.subirDescer}
          <Button variant="fantasma" size="icone36" className="text-muted hover:text-warn" aria-label={`Remover etapa ${item.titulo}`} onClick={() => setRemovendo(true)}>
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>
      {erro && (
        <p role="alert" className="m-0 pl-12 text-xs font-semibold text-warn">
          {erro}
        </p>
      )}
      <ModalConfirmacaoBlock
        aberto={removendo}
        titulo="Remover etapa"
        mensagem={`Tirar "${item.titulo}" desta trilha. ${avaliacao ? "A avaliação" : "O curso"} continua existindo; só deixa de ser uma etapa. As etapas seguintes sobem uma posição.`}
        textoConfirmar="Remover"
        carregando={pendente}
        onCancelar={() => setRemovendo(false)}
        onConfirmar={() => rodar(() => acaoRemoverItemTrilha({ itemId: item.id, versao: item.versao }), () => setRemovendo(false))}
      />
    </div>
  );
}

function DialogoAdicionar({ trilhaId, opcoes, onFechar }: { trilhaId: string; opcoes: OpcoesDeEtapa; onFechar: () => void }) {
  const [tipo, setTipo] = useState<TipoItemTrilha>("PRODUTO");
  const [alvo, setAlvo] = useState("");
  const [exige, setExige] = useState(true);
  const { erro, pendente, rodar } = useRodar();
  const lista = (tipo === "PRODUTO" ? opcoes.produtos : opcoes.avaliacoes).filter((o) => !opcoes.usados.includes(o.id));
  return (
    <DialogoAdmin
      aberto
      onFechar={onFechar}
      titulo="Adicionar etapa"
      descricao="Entra no fim da trilha; depois arraste para a posição certa."
      rodape={
        <>
          <Button variant="contorno" size="42" onClick={onFechar}>
            Voltar
          </Button>
          <Button
            size="42"
            carregando={pendente}
            disabled={!alvo}
            onClick={() =>
              rodar(
                () =>
                  tipo === "PRODUTO"
                    ? acaoAdicionarItemTrilha({ trilhaId, tipo, produtoId: alvo, exigeAnterior: exige })
                    : acaoAdicionarItemTrilha({ trilhaId, tipo, avaliacaoId: alvo, exigeAnterior: exige }),
                onFechar,
              )
            }
          >
            Adicionar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <CampoMoldura id="tipo-etapa" rotulo="Tipo">
          <GrupoChips
            id="tipo-etapa"
            aria-labelledby="tipo-etapa-rotulo"
            opcoes={[
              { valor: "PRODUTO", rotulo: "Curso" },
              { valor: "AVALIACAO", rotulo: "Avaliação" },
            ]}
            valor={tipo}
            onMudar={(v: TipoItemTrilha) => {
              setTipo(v);
              setAlvo("");
            }}
          />
        </CampoMoldura>
        <Selecao
          rotulo={tipo === "PRODUTO" ? "Curso" : "Avaliação"}
          tamanho="42"
          value={alvo}
          onChange={(e) => setAlvo(e.target.value)}
          vazio={lista.length ? "Escolha..." : tipo === "PRODUTO" ? "Nenhum curso disponível" : "Nenhuma avaliação publicada disponível"}
          opcoes={lista.map((o) => ({ valor: o.id, rotulo: o.titulo }))}
          ajuda={tipo === "PRODUTO" ? "Cursos publicados ou não listados que ainda não estão na trilha." : "Avaliações publicadas que ainda não estão na trilha."}
        />
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3.5">
          <div>
            <div id="exige-nova" className="text-sm font-semibold">
              Exige a etapa anterior
            </div>
            <div className="text-xs text-muted">Só libera depois que o aluno concluir a etapa de cima.</div>
          </div>
          <Interruptor aria-labelledby="exige-nova" ligado={exige} onAlternar={setExige} />
        </div>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </DialogoAdmin>
  );
}

/** Etapas da trilha: ordenáveis (arrastar ou subir/descer), "exige a anterior", adicionar e remover. */
export function ItensTrilha({ trilhaId, itens, opcoes }: { trilhaId: string; itens: ItemDaTrilha[]; opcoes: OpcoesDeEtapa }) {
  const ordem = useOrdemPersistida(itens, (novos) => acaoReordenarItensTrilha({ trilhaId, itens: novos }));
  const [adicionando, setAdicionando] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CartaoTitulo tamanho={15} como="h2">
            Etapas
          </CartaoTitulo>
          <p className="m-0 mt-0.5 text-xs text-muted">
            {ordem.itens.length} {ordem.itens.length === 1 ? "etapa" : "etapas"} · o aluno segue de cima para baixo
          </p>
        </div>
        <Button variant="contorno" size="36" onClick={() => setAdicionando(true)}>
          <Plus aria-hidden />
          Adicionar etapa
        </Button>
      </div>
      {ordem.erro && <Aviso tom="erro">{ordem.erro}</Aviso>}
      {ordem.itens.length === 0 ? (
        <EstadoVazio comMoldura titulo="Nenhuma etapa ainda" descricao="Adicione os cursos e as avaliações na ordem em que o aluno deve fazer. Publicar exige ao menos 1 etapa." />
      ) : (
        <div className="rounded-xl border border-border px-2">
          <ListaOrdenavel
            itens={ordem.itens}
            rotulo={(i) => `Etapa ${i.titulo}`}
            onReordenar={ordem.reordenar}
            desabilitado={ordem.pendente}
            renderItem={(i, controles) => <LinhaItem item={i} numero={ordem.itens.indexOf(i) + 1} controles={controles} />}
          />
        </div>
      )}
      {adicionando && <DialogoAdicionar trilhaId={trilhaId} opcoes={opcoes} onFechar={() => setAdicionando(false)} />}
    </div>
  );
}
