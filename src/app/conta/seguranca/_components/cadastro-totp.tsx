"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { acaoConfirmarTotp, acaoIniciarTotp } from "@/lib/actions/seguranca";
import { ListaCodigos } from "./lista-codigos";

type Cadastro = { qrSvg: string; segredo: string; codigosRecuperacao: string[] };

/**
 * Cadastro do TOTP em 2 passos: senha -> QR + codigos de recuperacao -> primeiro codigo.
 * Concluido, o servidor encerra TODAS as sessoes: a pessoa entra de novo com senha + codigo.
 */
export function CadastroTotp() {
  const [cadastro, setCadastro] = useState<Cadastro | null>(null);
  const [concluido, setConcluido] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  if (concluido) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <p className="m-0 text-sm">Segundo fator configurado. Por segurança, entre de novo com a senha e o código do aplicativo.</p>
        <Link href="/login" className={buttonVariants({ size: "42" })}>
          Ir para o login
        </Link>
      </div>
    );
  }

  if (!cadastro) {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const senha = String(new FormData(e.currentTarget).get("senha") ?? "");
          setErro(null);
          iniciar(async () => {
            const r = await acaoIniciarTotp({ senha });
            if (r.ok) setCadastro(r.dados);
            else setErro(r.erro);
          });
        }}
      >
        <Campo rotulo="Confirme sua senha" name="senha" type="password" autoComplete="current-password" required maxLength={128} erro={erro ?? undefined} />
        <Button type="submit" size="42" carregando={pendente} className="self-start">
          Começar
        </Button>
      </form>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const codigo = String(new FormData(e.currentTarget).get("codigo") ?? "");
        setErro(null);
        iniciar(async () => {
          const r = await acaoConfirmarTotp({ codigo });
          if (r.ok) setConcluido(true);
          else setErro(r.erro);
        });
      }}
    >
      <p className="m-0 text-sm text-muted">
        1. No celular, abra o aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password…) e leia o QR code.
      </p>
      {/* SVG gerado no servidor (uqr) a partir da URI otpauth://: sem script, sem dado de terceiro. */}
      <div className="size-48 rounded-lg bg-white p-2" aria-label="QR code do aplicativo autenticador" role="img" dangerouslySetInnerHTML={{ __html: cadastro.qrSvg }} />
      <p className="m-0 text-xs text-muted">
        Sem câmera? Digite a chave: <code className="font-mono break-all">{cadastro.segredo}</code>
      </p>
      <ListaCodigos codigos={cadastro.codigosRecuperacao} />
      <Campo
        rotulo="2. Digite o código de 6 dígitos que apareceu"
        name="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        maxLength={7}
        placeholder="000000"
        erro={erro ?? undefined}
      />
      <Button type="submit" size="42" carregando={pendente} className="self-start">
        Confirmar e concluir
      </Button>
    </form>
  );
}
