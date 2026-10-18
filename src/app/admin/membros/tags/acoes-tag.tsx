"use client";

import { useState } from "react";
import { MoreVertical, Pencil, Plus, Trash2, Users } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { acaoCriarTag, acaoExcluirTag, acaoSalvarTag } from "@/lib/actions/tags";
import { cn } from "@/lib/utils";
import { ChipTag } from "../_components/chip-tag";
import { useAcao } from "../_components/use-acao";

/** Cores prontas: legíveis nos dois temas como bolinha ao lado do nome. */
export const CORES_TAG = ["#e5484d", "#f76b15", "#e2a336", "#30a46c", "#12a594", "#0090ff", "#8e4ec6", "#d6409f", "#8b8d98"] as const;

function SeletorCorTag({ cor, onMudar }: { cor: string; onMudar: (c: string) => void }) {
  // Cor gravada fora da lista (outra versão da tela) continua escolhível.
  const cores = CORES_TAG.includes(cor as (typeof CORES_TAG)[number]) ? CORES_TAG : [...CORES_TAG, cor];
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 text-[13px] font-semibold">Cor</legend>
      <div className="flex flex-wrap gap-1">
        {cores.map((c) => (
          <label key={c} className="grid size-11 cursor-pointer place-items-center rounded-lg has-focus-visible:ring-3 has-focus-visible:ring-accent/25">
            <input type="radio" name="cor-tag" value={c} checked={cor === c} onChange={() => onMudar(c)} className="sr-only" aria-label={`Cor ${c}`} />
            <span
              aria-hidden
              className={cn("size-7 rounded-full border-2", cor === c ? "border-text" : "border-transparent")}
              style={{ backgroundColor: c, boxShadow: cor === c ? "inset 0 0 0 2px var(--surface)" : undefined }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface FormTagProps {
  aberto: boolean;
  titulo: string;
  inicial: { nome: string; cor: string };
  textoSalvar: string;
  pendente: boolean;
  erro: string | null;
  onFechar: () => void;
  onSalvar: (v: { nome: string; cor: string }) => void;
}

/** Nome + cor com a prévia de como a tag aparece na lista de membros. */
function FormTag({ aberto, titulo, inicial, textoSalvar, pendente, erro, onFechar, onSalvar }: FormTagProps) {
  const [nome, setNome] = useState(inicial.nome);
  const [cor, setCor] = useState(inicial.cor);
  return (
    <DialogoAdmin
      aberto={aberto}
      onFechar={onFechar}
      titulo={titulo}
      descricao="Tag só organiza a lista de membros: não libera curso, canal nem conteúdo (isso é grupo de acesso)."
      rodape={
        <>
          <Button variant="contorno" size="42" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            size="42"
            carregando={pendente}
            disabled={!nome.trim() || (nome.trim() === inicial.nome && cor === inicial.cor)}
            onClick={() => onSalvar({ nome, cor })}
          >
            {textoSalvar}
          </Button>
        </>
      }
    >
      <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} tamanho="42" erro={erro ?? undefined} />
      <SeletorCorTag cor={cor} onMudar={setCor} />
      <p className="m-0 flex items-center gap-2 text-[13px] text-muted">
        Prévia: <ChipTag tag={{ nome: nome.trim() || "Nome da tag", cor }} />
      </p>
    </DialogoAdmin>
  );
}

/** Botão "Nova tag" do cabeçalho. */
export function NovaTag() {
  const [aberto, setAberto] = useState(false);
  const { erro, setErro, pendente, rodar } = useAcao();
  const fechar = () => {
    setAberto(false);
    setErro(null);
  };
  return (
    <>
      <Button size="36" onClick={() => setAberto(true)}>
        <Plus className="size-3.5" aria-hidden />
        Nova tag
      </Button>
      {aberto && (
        <FormTag
          aberto
          titulo="Nova tag"
          inicial={{ nome: "", cor: CORES_TAG[5] }}
          textoSalvar="Criar tag"
          pendente={pendente}
          erro={erro}
          onFechar={fechar}
          onSalvar={(v) => rodar(() => acaoCriarTag(v), fechar)}
        />
      )}
    </>
  );
}

export interface AcoesTagProps {
  tag: { id: string; nome: string; cor: string; membros: number; versao: string };
}

/** Menu da linha: editar (trava de colisão), ver membros (filtro na lista) e excluir (modal block). */
export function AcoesTag({ tag }: AcoesTagProps) {
  const [editando, setEditando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const { erro, setErro, pendente, rodar } = useAcao();
  const fechar = () => {
    setEditando(false);
    setExcluindo(false);
    setErro(null);
  };
  return (
    <div className="flex justify-center">
      <MenuAdmin
        gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações da tag ${tag.nome}`} className="text-muted" />}
        itens={[
          { rotulo: "Editar", icone: <Pencil />, onSelecionar: () => setEditando(true) },
          { rotulo: "Ver membros", icone: <Users />, href: `/admin/membros?tag=${tag.id}` },
          { rotulo: "Excluir", icone: <Trash2 />, perigo: true, onSelecionar: () => setExcluindo(true) },
        ]}
      >
        <MoreVertical aria-hidden />
      </MenuAdmin>
      {editando && (
        <FormTag
          aberto
          titulo="Editar tag"
          inicial={{ nome: tag.nome, cor: tag.cor }}
          textoSalvar="Salvar"
          pendente={pendente}
          erro={erro}
          onFechar={fechar}
          onSalvar={(v) => rodar(() => acaoSalvarTag({ tagId: tag.id, versao: tag.versao, ...v }), fechar)}
        />
      )}
      <ModalConfirmacaoBlock
        aberto={excluindo && erro === null}
        titulo="Excluir tag"
        mensagem={`"${tag.nome}" sai da lista${
          tag.membros > 0 ? ` e é tirada de ${tag.membros} ${tag.membros === 1 ? "membro" : "membros"}` : ""
        }. Os membros não são afetados e o nome fica livre de novo. Fica registrado na trilha.`}
        textoConfirmar="Excluir"
        carregando={pendente}
        onCancelar={fechar}
        onConfirmar={() => rodar(() => acaoExcluirTag({ tagId: tag.id, versao: tag.versao }), fechar)}
      />
      <DialogoAdmin
        aberto={erro !== null && excluindo}
        onFechar={fechar}
        titulo="Não foi possível excluir"
        descricao={erro}
        rodape={
          <Button size="42" onClick={fechar}>
            Entendi
          </Button>
        }
      />
    </div>
  );
}
