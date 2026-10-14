"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ChatAssistente, type ConversaChat } from "@/components/assistente/chat-assistente";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { acaoApagarConversa } from "@/lib/actions/assistente";

export interface ChatDaPaginaProps {
  nomeAssistente: string;
  inicial: ConversaChat | null;
  indisponivel: string | null;
}

/**
 * `/assistente` (client): a conversa da URL (`?c=`) + "Apagar conversa" pelo modal block. Conversa
 * nova ganhou id = a URL passa a apontar para ela (e a lista do histórico se atualiza).
 */
export function ChatDaPagina({ nomeAssistente, inicial, indisponivel }: ChatDaPaginaProps) {
  const router = useRouter();
  const [versao, setVersao] = useState(inicial?.versao ?? null);
  const [confirmar, setConfirmar] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const apagar = async () => {
    if (!inicial || !versao) return;
    setApagando(true);
    const r = await acaoApagarConversa({ conversaId: inicial.conversaId, versao }).catch(() => null);
    setApagando(false);
    setConfirmar(false);
    if (!r || !r.ok) return setErro(r?.erro ?? "Sem conexão com o servidor. Tente de novo.");
    router.replace("/assistente");
    router.refresh();
  };

  return (
    <div className="flex min-h-[420px] flex-col gap-3">
      {inicial && (
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <p className="m-0 min-w-0 truncate text-sm font-bold">{inicial.mensagens.find((m) => m.papel === "USUARIO")?.texto ?? "Conversa"}</p>
          <Button type="button" variant="fantasma" size="36" className="shrink-0 text-muted" onClick={() => setConfirmar(true)}>
            <Trash2 aria-hidden />
            Apagar
          </Button>
        </div>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <ChatAssistente
        className="flex-1"
        nomeAssistente={nomeAssistente}
        inicial={inicial}
        indisponivel={indisponivel}
        avisoPrivacidade
        mostrarNova={false}
        onConversa={(c) => {
          if (!c) return router.replace("/assistente", { scroll: false });
          setVersao(c.versao);
          if (c.conversaId !== inicial?.conversaId) router.replace(`/assistente?c=${c.conversaId}`, { scroll: false });
          else router.refresh();
        }}
        vazio={
          <div className="flex flex-col gap-1.5 py-6">
            <p className="m-0 font-serif text-xl">Em que posso ajudar?</p>
            <p className="m-0 max-w-[520px] text-sm leading-relaxed text-muted">
              Pergunte sobre o conteúdo dos cursos a que você tem acesso. Cada resposta mostra de qual aula saiu, com o link para o minuto exato.
            </p>
          </div>
        }
      />
      <ModalConfirmacaoBlock
        aberto={confirmar}
        titulo="Apagar esta conversa"
        mensagem="A conversa some do seu histórico. As perguntas de hoje continuam contando no limite diário."
        textoConfirmar="Apagar"
        carregando={apagando}
        onCancelar={() => setConfirmar(false)}
        onConfirmar={apagar}
      />
    </div>
  );
}
