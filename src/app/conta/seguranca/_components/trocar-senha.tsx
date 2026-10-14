"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { acaoTrocarSenha } from "@/lib/actions/seguranca";
import { MAX_SENHA, MIN_SENHA, problemaNaSenha } from "@/lib/validators/senha";

/** Troca de senha: a ATUAL e a reautenticacao. As outras sessoes sao encerradas no servidor. */
export function TrocarSenha() {
  const form = useRef<HTMLFormElement>(null);
  const [nova, setNova] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [pendente, iniciar] = useTransition();
  const problema = nova.length > 0 ? problemaNaSenha(nova) : null;

  return (
    <form
      ref={form}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setErro(null);
        setFeito(false);
        iniciar(async () => {
          const r = await acaoTrocarSenha({ atual: String(f.get("atual") ?? ""), nova, confirmacao: String(f.get("confirmacao") ?? "") });
          if (!r.ok) return setErro(r.erro);
          setFeito(true);
          setNova("");
          form.current?.reset();
        });
      }}
    >
      <Campo rotulo="Senha atual" name="atual" type="password" autoComplete="current-password" required maxLength={MAX_SENHA} />
      <Campo
        rotulo="Nova senha"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_SENHA}
        maxLength={MAX_SENHA}
        value={nova}
        onChange={(e) => setNova(e.target.value)}
        ajuda={`Pelo menos ${MIN_SENHA} caracteres. Uma frase longa funciona bem.`}
        erro={problema ?? undefined}
      />
      <Campo rotulo="Confirmar nova senha" name="confirmacao" type="password" autoComplete="new-password" required maxLength={MAX_SENHA} erro={erro ?? undefined} />
      {feito && (
        <p role="status" className="m-0 text-sm text-ok">
          Senha trocada. As outras sessões foram encerradas.
        </p>
      )}
      <Button type="submit" size="42" carregando={pendente} disabled={!!problema} className="self-start">
        Trocar senha
      </Button>
    </form>
  );
}
