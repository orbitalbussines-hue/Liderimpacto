"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ListChecks, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { ListaOrdenavel, useOrdemPersistida, type ControlesOrdem } from "@/components/admin/lista-ordenavel";
import { MenuAdmin } from "@/components/admin/menu-admin";
import { EditorQuestao, type QuestaoEntrada } from "@/components/avaliacoes/editor-questao";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { CartaoTitulo } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import type { Resultado } from "@/lib/acao";
import { acaoCriarQuestao, acaoRemoverQuestao, acaoReordenarQuestoes, acaoSalvarQuestao } from "@/lib/actions/avaliacoes";
import { ROTULO_TIPO_QUESTAO } from "@/lib/avaliacoes/regras";

export interface QuestaoDoEditor {
  id: string;
  versao: string;
  questao: QuestaoEntrada;
}

export interface QuestoesAvaliacaoProps {
  avaliacaoId: string;
  publicada: boolean;
  questoes: QuestaoDoEditor[];
}

type Dialogo = { modo: "nova" } | { modo: "editar"; item: QuestaoDoEditor; numero: number } | { modo: "remover"; item: QuestaoDoEditor; numero: number } | null;

function LinhaQuestao({ item, numero, controles, onEditar, onRemover }: { item: QuestaoDoEditor; numero: number; controles: ControlesOrdem; onEditar: () => void; onRemover: () => void }) {
  const q = item.questao;
  const corretas = q.opcoes.filter((o) => o.correta).length;
  return (
    <div className="flex min-h-14 items-center gap-1.5 border-t border-border py-1.5 pr-1 pl-1.5 first:border-t-0">
      {controles.alca}
      <span className="w-6 shrink-0 text-center text-xs font-bold text-muted tabular-nums">{numero}</span>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onEditar} className="line-clamp-2 cursor-pointer text-left text-[13px] font-semibold text-text hover:text-accent">
          {q.enunciado}
        </button>
        <span className="block text-xs text-muted">
          {ROTULO_TIPO_QUESTAO[q.tipo]} · {q.opcoes.length} opções · {corretas} {corretas === 1 ? "correta" : "corretas"} · peso {q.peso}
        </span>
      </div>
      {/* Celular: arrastar pela alça (toque/teclado); subir/descer só onde cabe. */}
      <span className="hidden desk:flex">{controles.subirDescer}</span>
      <MenuAdmin
        gatilho={<Button variant="fantasma" size="icone36" aria-label={`Ações da questão ${numero}`} className="text-muted" />}
        itens={[
          { rotulo: "Editar questão", icone: <Pencil />, onSelecionar: onEditar },
          { rotulo: "Remover", icone: <Trash2 />, perigo: true, onSelecionar: onRemover },
        ]}
      >
        <MoreVertical aria-hidden />
      </MenuAdmin>
    </div>
  );
}

/**
 * Questões da avaliação: lista reordenável (arrastar pela alça, teclado ou subir/descer, gravando
 * com a versão de todas), criar/editar no diálogo e remover pelo modal block. Quem usa passa `key`
 * com as versões: dado novo do servidor remonta o estado local.
 */
export function QuestoesAvaliacao({ avaliacaoId, publicada, questoes }: QuestoesAvaliacaoProps) {
  const router = useRouter();
  const ordem = useOrdemPersistida(questoes, (itens) => acaoReordenarQuestoes({ avaliacaoId, itens }));
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const fechar = () => setDialogo(null);
  const abrir = (d: Dialogo) => {
    setErro(null);
    setDialogo(d);
  };
  const rodar = (acao: () => Promise<Resultado<unknown>>) =>
    iniciar(async () => {
      setErro(null);
      const r = await acao();
      if (!r.ok) return setErro(r.erro);
      fechar();
      router.refresh();
    });
  const total = ordem.itens.length;
  const pesoTotal = ordem.itens.reduce((s, i) => s + i.questao.peso, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CartaoTitulo tamanho={15} como="h2">
            Questões
          </CartaoTitulo>
          <p className="m-0 text-xs text-muted">
            {total} {total === 1 ? "questão" : "questões"} · peso total {pesoTotal} · arraste pela alça ou use as setas
          </p>
        </div>
        <Button size="36" onClick={() => abrir({ modo: "nova" })}>
          <Plus className="size-3.5" aria-hidden />
          Nova questão
        </Button>
      </div>

      {(ordem.erro || (erro && dialogo === null)) && (
        <p role="alert" className="m-0 text-[13px] font-semibold text-warn">
          {ordem.erro ?? erro}
        </p>
      )}
      {total === 0 ? (
        <EstadoVazio comMoldura icone={<ListChecks />} titulo="Nenhuma questão ainda" descricao="Cadastre ao menos uma questão para poder publicar." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <ListaOrdenavel
            itens={ordem.itens}
            rotulo={(i) => `Questão ${ordem.itens.indexOf(i) + 1}`}
            onReordenar={ordem.reordenar}
            desabilitado={ordem.pendente}
            renderItem={(item, c) => {
              const numero = ordem.itens.indexOf(item) + 1;
              return <LinhaQuestao item={item} numero={numero} controles={c} onEditar={() => abrir({ modo: "editar", item, numero })} onRemover={() => abrir({ modo: "remover", item, numero })} />;
            }}
          />
        </div>
      )}

      <EditorQuestao
        aberto={dialogo?.modo === "nova" || dialogo?.modo === "editar"}
        onFechar={fechar}
        titulo={dialogo?.modo === "editar" ? `Questão ${dialogo.numero}` : "Nova questão"}
        inicial={dialogo?.modo === "editar" ? dialogo.item.questao : undefined}
        carregando={pendente}
        erro={erro}
        onSalvar={(questao) =>
          rodar(() => (dialogo?.modo === "editar" ? acaoSalvarQuestao({ questaoId: dialogo.item.id, versao: dialogo.item.versao, questao }) : acaoCriarQuestao({ avaliacaoId, questao })))
        }
      />
      <ModalConfirmacaoBlock
        aberto={dialogo?.modo === "remover"}
        titulo={dialogo?.modo === "remover" ? `Remover a questão ${dialogo.numero}` : "Remover questão"}
        mensagem={
          publicada && total === 1
            ? "É a única questão de uma avaliação publicada: a remoção será recusada. Volte a avaliação para rascunho antes."
            : "A questão sai da avaliação (exclusão lógica, fica na trilha) e as seguintes sobem uma posição. Tentativas já corrigidas não mudam."
        }
        textoConfirmar="Remover"
        carregando={pendente}
        onCancelar={fechar}
        onConfirmar={() => {
          if (dialogo?.modo !== "remover") return;
          const { item } = dialogo;
          fechar();
          rodar(() => acaoRemoverQuestao({ questaoId: item.id, versao: item.versao }));
        }}
      />
    </div>
  );
}
