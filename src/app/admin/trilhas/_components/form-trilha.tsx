"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AreaTexto } from "@/components/ui/area-texto";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { acaoCriarTrilha, acaoSalvarTrilha } from "@/lib/actions/trilhas";

export interface FormTrilhaProps {
  /** Sem trilha = criar (e ir para o editor). */
  trilha?: { id: string; versao: string; campos: { titulo: string; descricao: string; tag: string } };
}

/** Dados da trilha: título, tag e descrição. Criar leva ao editor; salvar usa a trava pela versão. */
export function FormTrilha({ trilha }: FormTrilhaProps) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [pendente, iniciar] = useTransition();
  const c = trilha?.campos;

  return (
    <form
      className="flex flex-col gap-5"
      onChange={() => setFeito(false)}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const campos = { titulo: String(f.get("titulo") ?? ""), tag: String(f.get("tag") ?? ""), descricao: String(f.get("descricao") ?? "") };
        setErro(null);
        iniciar(async () => {
          if (!trilha) {
            const r = await acaoCriarTrilha(campos).catch(() => null);
            if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
            if (!r.ok) return setErro(r.erro);
            router.push(`/admin/trilhas/${r.dados.id}`);
            return;
          }
          const r = await acaoSalvarTrilha({ trilhaId: trilha.id, versao: trilha.versao, campos }).catch(() => null);
          if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
          if (!r.ok) return setErro(r.erro);
          setFeito(true);
          router.refresh();
        });
      }}
    >
      <div className="grid gap-5 min-[700px]:grid-cols-[minmax(0,1fr)_220px]">
        <Campo rotulo="Título" name="titulo" defaultValue={c?.titulo} required minLength={2} maxLength={160} tamanho="42" autoComplete="off" autoFocus={!trilha} />
        <Campo rotulo="Tag" name="tag" defaultValue={c?.tag} maxLength={40} tamanho="42" autoComplete="off" ajuda="Ex.: Trilha principal, Autoria." />
      </div>
      <AreaTexto rotulo="Descrição" name="descricao" defaultValue={c?.descricao} maxLength={2000} rows={4} ajuda="Aparece no cartão da trilha para o aluno." />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {feito && <Aviso tom="ok">Dados salvos.</Aviso>}
      <Button type="submit" size="42" carregando={pendente} className="self-start">
        {trilha ? "Salvar dados" : "Criar e montar as etapas"}
      </Button>
    </form>
  );
}
