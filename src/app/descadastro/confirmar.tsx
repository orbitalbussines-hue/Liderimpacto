"use client";

import { useActionState, type ReactNode } from "react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { confirmarDescadastro } from "./acoes";

/** h1 do CabecalhoEntrada, sem quebrar "e-mails" no hífen. */
function Cabecalho({ titulo, children }: { titulo: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="m-0 text-[32px] desk:text-[36px]">{titulo}</h1>
      <p className="m-0 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}

/** Pergunta + "Confirmar" (server action) e, depois, o estado de sucesso. */
export function ConfirmarDescadastro({ token, area }: { token: string; area: string }) {
  const [estado, acao, enviando] = useActionState(confirmarDescadastro, null);
  if (estado?.ok)
    return (
      <Cabecalho titulo="Pronto.">
        Você não vai mais receber e-mails de marketing de {area}. E-mails de acesso e senha continuam chegando. Se mudar de ideia, fale com a equipe da área.
      </Cabecalho>
    );
  return (
    <div className="flex flex-col gap-6">
      <Cabecalho
        titulo={
          <>
            Parar de receber <span className="whitespace-nowrap">e-mails?</span>
          </>
        }
      >
        Você não vai mais receber e-mails de marketing de {area}. E-mails de acesso e senha continuam chegando.
      </Cabecalho>
      <form action={acao} className="flex flex-col gap-4">
        <input type="hidden" name="t" value={token} />
        {estado && !estado.ok && <Aviso tom="erro">{estado.erro}</Aviso>}
        <Button type="submit" size="50" larguraTotal carregando={enviando}>
          {enviando ? "Confirmando…" : "Confirmar"}
        </Button>
      </form>
    </div>
  );
}
