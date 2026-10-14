"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { CampoCodigo } from "@/components/ui/campo-codigo";
import { verificarCodigo, type EstadoForm } from "@/lib/actions/auth";
import { CabecalhoEntrada, LinhaConfianca, LinkVoltarLogin } from "../../_autenticacao/pecas";

/** Passo 2 da entrada: 6 digitos do aplicativo (envia sozinho no ultimo) ou codigo de recuperacao. */
export function FormVerificar({ destino }: { destino?: string }) {
  const [tentativa, setTentativa] = useState(0);
  const [recuperacao, setRecuperacao] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const [estado, acao, enviando] = useActionState(async (anterior: EstadoForm, dados: FormData) => {
    const r = await verificarCodigo(anterior, dados);
    // Recusa: limpa as caixas (nova key) e devolve o foco para a primeira.
    if (r) setTentativa((t) => t + 1);
    return r;
  }, null);

  function enviarCodigo(codigo: string) {
    if (!form.current || enviando) return;
    const dados = new FormData(form.current);
    dados.set("codigo", codigo);
    startTransition(() => acao(dados));
  }

  return (
    <form ref={form} action={acao} className="flex flex-col gap-6">
      <CabecalhoEntrada titulo="Confirme que é você">
        {recuperacao
          ? "Digite um dos códigos de recuperação que você guardou ao ativar a verificação."
          : "Digite o código de 6 dígitos do seu aplicativo autenticador."}
      </CabecalhoEntrada>

      {estado?.erro && <Aviso tom="erro">{estado.erro}</Aviso>}

      {recuperacao ? (
        <Campo
          key="recuperacao"
          rotulo="Código de recuperação"
          name="codigo"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          required
          maxLength={24}
          tamanho="48"
          fundo="surface"
          className="font-mono tracking-wider"
        />
      ) : (
        <CampoCodigo
          key={tentativa}
          rotulo="Código do aplicativo"
          name="codigo"
          autoFocus
          disabled={enviando}
          onCompleto={enviarCodigo}
        />
      )}

      {destino && <input type="hidden" name="de" value={destino} />}

      <div className="flex flex-col gap-2">
        <Button type="submit" size="50" larguraTotal carregando={enviando}>
          {enviando ? "Confirmando…" : "Confirmar"}
        </Button>
        <Button
          type="button"
          variant="fantasma"
          size="46"
          larguraTotal
          onClick={() => setRecuperacao((r) => !r)}
          className="text-muted hover:text-text"
        >
          {recuperacao ? "Usar o código do aplicativo" : "Usar um código de recuperação"}
        </Button>
      </div>

      <div className="flex flex-col items-center gap-3 border-t border-border pt-4">
        <LinkVoltarLogin />
        <LinhaConfianca />
      </div>
    </form>
  );
}
