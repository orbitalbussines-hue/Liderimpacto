"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { KeyRound, List, MoreVertical, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import type { Resultado } from "@/lib/acao";
import { acaoExcluirWebhook, acaoMudarSituacaoWebhook, acaoRotacionarSegredoWebhook } from "@/lib/actions/webhooks";
import type { SituacaoWebhook } from "@/lib/db/schema/_enums";
import { DialogoWebhook, type WebhookEditavel } from "./dialogo-webhook";
import { SegredoUmaVez } from "./segredo-uma-vez";

type Aberto = "editar" | "segredo" | "excluir" | null;

/**
 * Menu "⋮" do webhook: entregas, editar, pausar/ativar, trocar segredo e excluir (os dois últimos
 * com ModalConfirmacaoBlock). A action confere papel, criador e versão de novo.
 */
export function AcoesWebhook({ webhook: w, situacao }: { webhook: WebhookEditavel; situacao: SituacaoWebhook }) {
  const router = useRouter();
  const [aberto, setAberto] = useState<Aberto>(null);
  const [segredo, setSegredo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const rodar = <T,>(acao: () => Promise<Resultado<T>>, depois?: (dados: T) => void) =>
    iniciar(async () => {
      const r = await acao().catch(() => null);
      setAberto(null);
      if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
      if (!r.ok) return setErro(r.erro);
      depois?.(r.dados);
      router.refresh();
    });

  const pausado = situacao === "PAUSADO";
  const itens: ItemMenuAdmin[] = [
    { rotulo: "Ver entregas", icone: <List />, href: `/admin/configuracoes/webhooks/${w.id}` },
    { rotulo: "Editar", icone: <Pencil />, onSelecionar: () => setAberto("editar") },
    {
      rotulo: pausado ? "Ativar" : "Pausar",
      icone: pausado ? <Play /> : <Pause />,
      onSelecionar: () => rodar(() => acaoMudarSituacaoWebhook({ webhookId: w.id, versao: w.versao, situacao: pausado ? "ATIVO" : "PAUSADO" })),
    },
    { rotulo: "Trocar segredo", icone: <KeyRound />, onSelecionar: () => setAberto("segredo") },
    { rotulo: "Excluir", icone: <Trash2 />, perigo: true, onSelecionar: () => setAberto("excluir") },
  ];

  return (
    <div className="flex justify-center">
      <MenuAdmin gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações do webhook ${w.nome}`} className="text-muted" />} itens={itens}>
        <MoreVertical aria-hidden />
      </MenuAdmin>

      <DialogoWebhook aberto={aberto === "editar"} onFechar={() => setAberto(null)} webhook={w} />

      <ModalConfirmacaoBlock
        aberto={aberto === "segredo"}
        titulo="Trocar o segredo"
        mensagem={`Gera um segredo novo para "${w.nome}". O atual deixa de valer na hora: o sistema que recebe passa a recusar os envios até você colocar o novo lá. O novo aparece uma única vez.`}
        textoConfirmar="Trocar segredo"
        carregando={pendente}
        onCancelar={() => setAberto(null)}
        onConfirmar={() => rodar(() => acaoRotacionarSegredoWebhook({ webhookId: w.id, versao: w.versao }), (d) => setSegredo(d.segredo))}
      />

      <ModalConfirmacaoBlock
        aberto={aberto === "excluir"}
        titulo="Excluir webhook"
        mensagem={`Exclui "${w.nome}" (${w.url}). Nenhum evento novo é enviado para este endereço e as entregas pendentes param. A exclusão fica registrada nos Logs.`}
        textoConfirmar="Excluir"
        carregando={pendente}
        onCancelar={() => setAberto(null)}
        onConfirmar={() => rodar(() => acaoExcluirWebhook({ webhookId: w.id, versao: w.versao }))}
      />

      <SegredoUmaVez segredo={segredo} nome={w.nome} onFechar={() => setSegredo(null)} />

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
