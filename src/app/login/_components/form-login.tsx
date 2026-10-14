"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { ArrowRight, KeyRound, Mail } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { CaixaSelecao } from "@/components/ui/caixa-selecao";
import { Campo } from "@/components/ui/campo";
import { CampoSenha } from "@/components/ui/campo-senha";
import { entrar } from "@/lib/actions/auth";
import { CabecalhoEntrada, LinhaConfianca } from "../../_autenticacao/pecas";

interface FormLoginProps {
  /** Caminho interno para voltar depois de entrar (ja validado no servidor). */
  destino?: string;
  plataforma: boolean;
}

/** Formulario de entrada. Toda recusa chega com a MESMA mensagem (o servidor garante). */
export function FormLogin({ destino, plataforma }: FormLoginProps) {
  const [estado, acao, enviando] = useActionState(entrar, null);
  // Controlado: o React limpa campos nao controlados depois da action; o e-mail fica.
  const [email, setEmail] = useState("");
  const idErro = useId();
  const erro = estado?.erro;
  const descricaoErro = erro ? { "aria-invalid": true, "aria-describedby": idErro } : {};

  return (
    <form action={acao} className="flex flex-col gap-6">
      <CabecalhoEntrada titulo={plataforma ? "Entrar na plataforma" : "Bem-vindo de volta"}>
        {destino
          ? "Sua sessão expirou. Entre novamente para continuar de onde parou."
          : "Entre com o e-mail e a senha da sua conta."}
      </CabecalhoEntrada>

      {erro && (
        <Aviso tom="erro" id={idErro}>
          {erro}
        </Aviso>
      )}

      <div className="flex flex-col gap-4">
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          tamanho="48"
          fundo="surface"
          icone={<Mail />}
          {...descricaoErro}
        />
        <div className="flex flex-col gap-1">
          <CampoSenha
            rotulo="Senha"
            name="senha"
            autoComplete="current-password"
            required
            maxLength={128}
            tamanho="48"
            fundo="surface"
            icone={<KeyRound />}
            {...descricaoErro}
          />
          <div className="flex items-center justify-between gap-3">
            <CaixaSelecao rotulo="Manter conectado" name="manterConectado" defaultChecked />
            <Link
              href="/recuperar-senha"
              className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent underline-offset-4 hover:underline"
            >
              Esqueci a senha
            </Link>
          </div>
        </div>
      </div>

      {destino && <input type="hidden" name="de" value={destino} />}

      <Button type="submit" size="50" larguraTotal carregando={enviando} className="group">
        {enviando ? (
          "Entrando…"
        ) : (
          <>
            Entrar
            <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
          </>
        )}
      </Button>

      <div className="flex flex-col gap-4 border-t border-border pt-5">
        {!plataforma && (
          <p className="m-0 text-center text-[13px] text-muted">
            Primeiro acesso?{" "}
            <Link
              href="/recuperar-senha?primeiro=1"
              className="font-semibold text-text underline decoration-border underline-offset-4 transition-colors hover:decoration-accent"
            >
              Criar minha senha
            </Link>
          </p>
        )}
        <LinhaConfianca>
          {plataforma ? "Conexão segura · verificação em duas etapas" : "Conexão segura"}
        </LinhaConfianca>
      </div>
    </form>
  );
}
