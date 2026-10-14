"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { pedirLinkDeSenha } from "@/lib/actions/auth";
import { CabecalhoEntrada, LinhaConfianca, LinkVoltarLogin } from "../_autenticacao/pecas";

/** Pede o link de definir senha. `primeiroAcesso` so muda o texto (vem de "Criar minha senha"). */
export function FormRecuperar({ primeiroAcesso = false }: { primeiroAcesso?: boolean }) {
  const [estado, acao, enviando] = useActionState(pedirLinkDeSenha, null);
  return (
    <div className="flex flex-col gap-6">
      {primeiroAcesso ? (
        <CabecalhoEntrada titulo="Crie sua senha">
          No primeiro acesso, a equipe da sua área envia por e-mail um link para você criar a senha. Não
          recebeu ou o link expirou? Informe o e-mail da sua conta.
        </CabecalhoEntrada>
      ) : (
        <CabecalhoEntrada titulo="Esqueci a senha">
          Informe o e-mail da sua conta para receber um link e definir uma nova senha.
        </CabecalhoEntrada>
      )}

      {estado ? (
        <Aviso tom="info">{estado.mensagem}</Aviso>
      ) : (
        <form action={acao} className="flex flex-col gap-6">
          <Campo
            rotulo="E-mail"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
            maxLength={254}
            placeholder="voce@email.com"
            tamanho="48"
            fundo="surface"
            icone={<Mail />}
          />
          <Button type="submit" size="50" larguraTotal carregando={enviando}>
            {enviando ? "Enviando…" : "Enviar link"}
          </Button>
        </form>
      )}

      <div className="flex flex-col items-center gap-3 border-t border-border pt-4">
        <LinkVoltarLogin />
        <LinhaConfianca />
      </div>
    </div>
  );
}
