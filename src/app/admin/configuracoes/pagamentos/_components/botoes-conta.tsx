"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button, buttonVariants } from "@/components/ui/button";
import { acaoAtualizarContaStripe, acaoConectarStripe } from "@/lib/actions/pagamentos";

export interface BotoesContaProps {
  estado: "desconectada" | "pendente" | "ativa";
  /** `?stripe=retorno` (volta do cadastro: relê o status) ou `?stripe=renovar` (link venceu: gera outro e vai). */
  chegada: "retorno" | "renovar" | null;
}

type Mensagem = { tom: "ok" | "erro" | "info"; texto: string };

/**
 * Ações da conta Stripe (só DONO; a action confere de novo). O link de cadastro do Stripe é de uso
 * único e curto: pede na hora do clique e redireciona. A chegada pela URL roda UMA vez (ref) e limpa o
 * parâmetro, para recarregar a página não repetir.
 */
export function BotoesConta({ estado, chegada }: BotoesContaProps) {
  const router = useRouter();
  const caminho = usePathname();
  const [mensagem, setMensagem] = useState<Mensagem | null>(chegada === "renovar" ? { tom: "info", texto: "O link do cadastro venceu. Gerando um novo…" } : null);
  const [pendente, iniciar] = useTransition();
  const rodou = useRef(false);

  const irParaStripe = () =>
    iniciar(async () => {
      const r = await acaoConectarStripe().catch(() => null);
      if (!r) return setMensagem({ tom: "erro", texto: "Sem conexão com o servidor. Tente de novo." });
      if (!r.ok) return setMensagem({ tom: "erro", texto: r.erro });
      window.location.assign(r.dados.url);
    });

  const atualizar = (limparUrl: boolean) =>
    iniciar(async () => {
      const r = await acaoAtualizarContaStripe().catch(() => null);
      if (limparUrl) router.replace(caminho);
      if (!r) return setMensagem({ tom: "erro", texto: "Sem conexão com o servidor. Tente de novo." });
      if (!r.ok) return setMensagem({ tom: "erro", texto: r.erro });
      setMensagem(
        r.dados.cobrancasAtivas
          ? { tom: "ok", texto: "Conta conferida: cobranças liberadas. Sua área já pode vender." }
          : r.dados.dadosEnviados
            ? { tom: "info", texto: "Cadastro enviado. O Stripe ainda está analisando; as vendas liberam quando ele aprovar." }
            : { tom: "info", texto: "O cadastro no Stripe ainda não foi concluído. Use “Continuar cadastro” para terminar." },
      );
      router.refresh();
    });

  useEffect(() => {
    if (rodou.current || !chegada) return;
    rodou.current = true;
    if (chegada === "retorno") atualizar(true);
    else irParaStripe();
    // Só na chegada: as funções mudam a cada render, mas a ref garante uma execução.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chegada]);

  return (
    <div className="flex flex-col gap-3">
      {mensagem && <Aviso tom={mensagem.tom}>{mensagem.texto}</Aviso>}
      <div className="flex flex-wrap gap-2">
        {estado === "desconectada" && (
          <Button size="36" carregando={pendente} onClick={irParaStripe}>
            Conectar Stripe
          </Button>
        )}
        {estado === "pendente" && (
          <Button size="36" carregando={pendente} onClick={irParaStripe}>
            Continuar cadastro
          </Button>
        )}
        {estado !== "desconectada" && (
          <Button variant="contorno" size="36" disabled={pendente} onClick={() => atualizar(false)}>
            <RefreshCw className="size-3.5" aria-hidden />
            Atualizar
          </Button>
        )}
        {estado === "ativa" && (
          <a href="https://dashboard.stripe.com/" target="_blank" rel="noreferrer" className={buttonVariants({ variant: "contorno", size: "36" })}>
            Dashboard do Stripe
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}
