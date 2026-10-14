"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { CampoMoldura } from "@/components/ui/campo-moldura";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { acaoCriarGrupo, acaoRemoverGrupo, acaoRenomearGrupo } from "@/lib/actions/grupos";
import type { TipoGrupo } from "@/lib/db/schema/_enums";

/** Roda a action, mostra o erro ou fecha e recarrega a lista. */
function useAcao() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (acao: () => Promise<{ ok: boolean; erro?: string }>, aoConcluir: () => void) =>
    iniciar(async () => {
      setErro(null);
      const r = await acao();
      if (!r.ok) return setErro(r.erro ?? "Falha inesperada.");
      aoConcluir();
      router.refresh();
    });
  return { erro, setErro, pendente, rodar };
}

/** Botão "Novo grupo" do cabeçalho + diálogo (nome e tipo). */
export function NovoGrupo() {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoGrupo>("TURMA");
  const { erro, setErro, pendente, rodar } = useAcao();
  const fechar = () => {
    setAberto(false);
    setNome("");
    setErro(null);
  };
  return (
    <>
      <Button size="36" onClick={() => setAberto(true)}>
        <Plus className="size-3.5" aria-hidden />
        Novo grupo
      </Button>
      <DialogoAdmin
        aberto={aberto}
        onFechar={fechar}
        titulo="Novo grupo"
        descricao="Turma reúne alunos de uma mesma entrada; grupo de acesso libera conteúdos e canais."
        rodape={
          <>
            <Button variant="contorno" size="42" onClick={fechar}>
              Cancelar
            </Button>
            <Button size="42" carregando={pendente} onClick={() => rodar(() => acaoCriarGrupo({ nome, tipo }), fechar)}>
              Criar grupo
            </Button>
          </>
        }
      >
        <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} tamanho="42" erro={erro ?? undefined} />
        <CampoMoldura id="tipo-grupo" rotulo="Tipo">
          <GrupoChips
            id="tipo-grupo"
            aria-labelledby="tipo-grupo-rotulo"
            opcoes={[
              { valor: "TURMA", rotulo: "Turma" },
              { valor: "ACESSO", rotulo: "Grupo de acesso" },
            ]}
            valor={tipo}
            onMudar={(v) => setTipo(v as TipoGrupo)}
          />
        </CampoMoldura>
      </DialogoAdmin>
    </>
  );
}

export interface AcoesGrupoProps {
  grupo: { id: string; nome: string; membros: number; versao: string };
}

/** Menu da linha: renomear (trava de colisão) e remover (modal block; recusado com membros). */
export function AcoesGrupo({ grupo }: AcoesGrupoProps) {
  const [renomeando, setRenomeando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [nome, setNome] = useState(grupo.nome);
  const { erro, setErro, pendente, rodar } = useAcao();
  return (
    <div className="flex justify-center">
      <MenuAdmin
        gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações do grupo ${grupo.nome}`} className="text-muted" />}
        itens={[
          { rotulo: "Renomear", icone: <Pencil />, onSelecionar: () => setRenomeando(true) },
          { rotulo: "Remover", icone: <Trash2 />, perigo: true, onSelecionar: () => setRemovendo(true) },
        ]}
      >
        <MoreVertical aria-hidden />
      </MenuAdmin>
      <DialogoAdmin
        aberto={renomeando}
        onFechar={() => setRenomeando(false)}
        titulo="Renomear grupo"
        rodape={
          <>
            <Button variant="contorno" size="42" onClick={() => setRenomeando(false)}>
              Cancelar
            </Button>
            <Button
              size="42"
              carregando={pendente}
              disabled={nome.trim() === grupo.nome}
              onClick={() => rodar(() => acaoRenomearGrupo({ grupoId: grupo.id, nome, versao: grupo.versao }), () => setRenomeando(false))}
            >
              Salvar
            </Button>
          </>
        }
      >
        <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} tamanho="42" erro={erro ?? undefined} />
      </DialogoAdmin>
      <ModalConfirmacaoBlock
        aberto={removendo && erro === null}
        titulo="Remover grupo"
        mensagem={
          grupo.membros > 0
            ? `"${grupo.nome}" tem ${grupo.membros} ${grupo.membros === 1 ? "membro" : "membros"}: a remoção será recusada. Retire-os do grupo antes (menu Grupos na lista de membros).`
            : `"${grupo.nome}" sai da lista (exclusão lógica, fica na trilha). Os membros não são afetados.`
        }
        textoConfirmar="Remover"
        carregando={pendente}
        onCancelar={() => setRemovendo(false)}
        onConfirmar={() =>
          rodar(
            () => acaoRemoverGrupo({ grupoId: grupo.id, versao: grupo.versao }),
            () => setRemovendo(false)
          )
        }
      />
      <DialogoAdmin
        aberto={erro !== null && !renomeando}
        onFechar={() => {
          setErro(null);
          setRemovendo(false);
        }}
        titulo="Não foi possível concluir"
        descricao={erro}
        rodape={
          <Button
            size="42"
            onClick={() => {
              setErro(null);
              setRemovendo(false);
            }}
          >
            Entendi
          </Button>
        }
      />
    </div>
  );
}
