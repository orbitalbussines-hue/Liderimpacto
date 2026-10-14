"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { acaoRenomearArea } from "@/lib/actions/configuracoes";

export interface FormNomeAreaProps {
  nomeInicial: string;
  /** `updated_at` ISO do criador (trava de colisão). */
  versaoInicial: string;
}

/** Nome da área (só DONO). Colisão com outra edição volta como mensagem; nada é sobrescrito. */
export function FormNomeArea({ nomeInicial, versaoInicial }: FormNomeAreaProps) {
  const router = useRouter();
  const [salvo, setSalvo] = useState(nomeInicial);
  const [nome, setNome] = useState(nomeInicial);
  const [versao, setVersao] = useState(versaoInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [pendente, iniciar] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        setFeito(false);
        iniciar(async () => {
          const r = await acaoRenomearArea({ nome, versao });
          if (!r.ok) return setErro(r.erro);
          setSalvo(r.dados.nome);
          setNome(r.dados.nome);
          setVersao(r.dados.versao);
          setFeito(true);
          router.refresh();
        });
      }}
    >
      <Campo
        rotulo="Nome da área"
        name="nome"
        value={nome}
        onChange={(e) => {
          setNome(e.target.value);
          setFeito(false);
        }}
        required
        minLength={2}
        maxLength={80}
        autoComplete="off"
        ajuda="Aparece na tela de entrada, nas mensagens da área do aluno, na verificação dos certificados e nos e-mails."
        erro={erro ?? undefined}
      />
      {feito && (
        <p role="status" className="m-0 text-[13px] font-semibold text-ok">
          Salvo. A área agora se chama {salvo}.
        </p>
      )}
      <Button type="submit" size="42" carregando={pendente} disabled={nome.trim() === salvo || nome.trim().length < 2} className="self-start">
        Salvar
      </Button>
    </form>
  );
}
