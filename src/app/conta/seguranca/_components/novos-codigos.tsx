"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { acaoNovosCodigos } from "@/lib/actions/seguranca";
import { ListaCodigos } from "./lista-codigos";

/** Novos codigos de recuperacao: exige senha + codigo do aplicativo (a prova de um login completo). */
export function NovosCodigos() {
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  if (codigos) return <ListaCodigos codigos={codigos} />;
  return (
    <form
      className="grid gap-3 desk:grid-cols-[1fr_160px_auto] desk:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setErro(null);
        iniciar(async () => {
          const r = await acaoNovosCodigos({ senha: String(f.get("senha") ?? ""), codigo: String(f.get("codigo") ?? "") });
          if (r.ok) setCodigos(r.dados);
          else setErro(r.erro);
        });
      }}
    >
      <Campo rotulo="Senha" name="senha" type="password" autoComplete="current-password" required maxLength={128} erro={erro ?? undefined} />
      <Campo rotulo="Código do aplicativo" name="codigo" inputMode="numeric" autoComplete="one-time-code" required maxLength={7} />
      <Button type="submit" size="42" variant="contorno" carregando={pendente}>
        Gerar novos códigos
      </Button>
    </form>
  );
}
