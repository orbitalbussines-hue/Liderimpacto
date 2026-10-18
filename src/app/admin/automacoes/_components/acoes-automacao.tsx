"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { History, MoreVertical, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import type { Resultado } from "@/lib/acao";
import { acaoExcluirAutomacao, acaoMudarSituacaoAutomacao } from "@/lib/actions/automacoes";
import type { SituacaoAutomacao } from "@/lib/db/schema/_enums";

export interface AutomacaoDaLinha {
  id: string;
  nome: string;
  /** `updated_at` ISO (trava de colisão). */
  versao: string;
  situacao: SituacaoAutomacao;
  /** Execuções esperando a hora marcada (pausar ou excluir = não acontecem). */
  agendadas: number;
}

/** Menu "⋮" da automação: editar, histórico, ativar/pausar e excluir (ModalConfirmacaoBlock). */
export function AcoesAutomacao({ automacao: a }: { automacao: AutomacaoDaLinha }) {
  const router = useRouter();
  const [excluir, setExcluir] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const rodar = (acao: () => Promise<Resultado<unknown>>) =>
    iniciar(async () => {
      const r = await acao().catch(() => null);
      setExcluir(false);
      if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
      if (!r.ok) return setErro(r.erro);
      router.refresh();
    });

  const ativa = a.situacao === "ATIVA";
  const itens: ItemMenuAdmin[] = [
    { rotulo: "Editar", icone: <Pencil />, href: `/admin/automacoes/${a.id}` },
    { rotulo: "Ver histórico", icone: <History />, href: `/admin/automacoes/historico?automacao=${a.id}` },
    {
      rotulo: ativa ? "Pausar" : "Ativar",
      icone: ativa ? <Pause /> : <Play />,
      onSelecionar: () => rodar(() => acaoMudarSituacaoAutomacao({ automacaoId: a.id, versao: a.versao, situacao: ativa ? "PAUSADA" : "ATIVA" })),
    },
    { rotulo: "Excluir", icone: <Trash2 />, perigo: true, onSelecionar: () => setExcluir(true) },
  ];

  const naEspera = a.agendadas > 0 ? ` ${a.agendadas === 1 ? "A 1 ação que está esperando a hora marcada não vai acontecer." : `As ${a.agendadas} ações que estão esperando a hora marcada não vão acontecer.`}` : "";

  return (
    <div className="flex justify-center">
      <MenuAdmin gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações da automação ${a.nome}`} className="text-muted" />} itens={itens}>
        <MoreVertical aria-hidden />
      </MenuAdmin>

      <ModalConfirmacaoBlock
        aberto={excluir}
        titulo="Excluir automação"
        mensagem={`Exclui "${a.nome}". Ela para de agir na hora.${naEspera} O histórico do que já foi feito continua guardado e a exclusão fica registrada nos Logs.`}
        textoConfirmar="Excluir"
        carregando={pendente}
        onCancelar={() => setExcluir(false)}
        onConfirmar={() => rodar(() => acaoExcluirAutomacao({ automacaoId: a.id, versao: a.versao }))}
      />

      <DialogoAdmin
        aberto={erro !== null}
        onFechar={() => setErro(null)}
        titulo="Não foi possível concluir"
        rodape={
          <Button size="42" onClick={() => setErro(null)}>
            Entendi
          </Button>
        }
      >
        <Aviso tom="erro">{erro}</Aviso>
      </DialogoAdmin>
    </div>
  );
}
