import type { Metadata } from "next";
import { Suspense } from "react";
import { MolduraAbas } from "@/components/admin/moldura-abas";
import { ChatAssistente } from "@/components/assistente/chat-assistente";
import { iaConfigurada } from "@/lib/assistente/cliente";
import { configDoAssistente } from "@/lib/assistente/config";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { ABAS_ASSISTENTE, AvisoIaNaoConfigurada, SeloSituacao } from "../_components/comum";

export const metadata: Metadata = { title: "Testar · Assistente do professor" };

async function Conteudo() {
  const { criador, membro } = await membroDaPagina(EQUIPE);
  const c = await configDoAssistente(criador.id);
  const indisponivel = !iaConfigurada()
    ? "IA não configurada: o teste fica disponível quando a chave da Anthropic estiver definida no servidor."
    : !membro.id
      ? "Entre com uma conta da equipe desta área para testar (o acesso de suporte não conversa)."
      : null;
  return (
    <div className="flex flex-col gap-4">
      {!iaConfigurada() && <AvisoIaNaoConfigurada />}
      <MolduraAbas titulo="Assistente do professor" meta={<SeloSituacao ligado={c.ligado} />} abas={ABAS_ASSISTENTE} ativa="Testar">
        <div className="flex max-w-[760px] flex-col gap-4">
          <p className="m-0 text-[13px] leading-relaxed text-muted">
            Converse como se fosse um aluno com acesso a todos os cursos em que o assistente aparece. Funciona mesmo desligado; as perguntas contam no consumo, mas não aparecem em “Perguntas”.
          </p>
          <ChatAssistente
            nomeAssistente={c.nome}
            inicial={null}
            teste
            indisponivel={indisponivel}
            className="min-h-[360px]"
            vazio={<p className="m-0 py-6 text-sm text-muted">Faça uma pergunta que um aluno faria. A resposta mostra as fontes usadas, com link para a aula.</p>}
          />
        </div>
      </MolduraAbas>
    </div>
  );
}

/** Playground do assistente (DONO e ADMIN): como um aluno com acesso a tudo. */
export default function PaginaTestarAssistente() {
  return (
    <Suspense fallback={null}>
      <Conteudo />
    </Suspense>
  );
}
