"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { LinkDeAcesso } from "@/components/admin/link-de-acesso";
import { Button, buttonVariants } from "@/components/ui/button";
import { CaixaSelecao } from "@/components/ui/caixa-selecao";
import { Campo } from "@/components/ui/campo";
import { CampoMoldura } from "@/components/ui/campo-moldura";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { acaoCadastrarMembro } from "@/lib/actions/membros";
import type { PapelCriador } from "@/lib/db/schema/_enums";
import { ROTULO_PAPEL } from "../_components/comum";

export interface FormCadastrarMembroProps {
  /** Papéis que QUEM ESTÁ LOGADO pode dar (o servidor confere de novo). */
  papeis: PapelCriador[];
  grupos: { id: string; nome: string }[];
  area: string;
  /** Link do fim do cadastro (padrão: lista de membros). */
  voltar?: { href: string; rotulo: string };
  /** Texto do botão de envio (padrão: "Cadastrar"). */
  textoEnviar?: string;
}

type Feito = { nome: string; link: { url: string; expiraEm: string } | null; emailEnviado: boolean; aviso: string | null };

export function FormCadastrarMembro({ papeis, grupos, area, voltar = { href: "/admin/membros", rotulo: "Ver membros" }, textoEnviar = "Cadastrar" }: FormCadastrarMembroProps) {
  const [papel, setPapel] = useState<PapelCriador>(papeis[0] ?? "ALUNO");
  const [grupoIds, setGrupoIds] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<Feito | null>(null);
  const [pendente, iniciar] = useTransition();

  if (feito) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="m-0 flex items-center gap-2 text-sm font-semibold text-ok">
          <CheckCircle2 className="size-4" aria-hidden />
          {feito.nome} agora é membro de {area}.
        </p>
        {feito.link && <LinkDeAcesso url={feito.link.url} expiraEm={feito.link.expiraEm} rotulo="Link de primeiro acesso" />}
        {feito.link && feito.emailEnviado && <p className="m-0 text-[13px] text-muted">O link também foi enviado por e-mail.</p>}
        {feito.aviso && <p className="m-0 rounded-lg border border-border bg-surface-2 p-3 text-[13px]">{feito.aviso}</p>}
        <div className="flex flex-wrap gap-2.5 border-t border-border pt-4">
          <Button variant="contorno" size="42" onClick={() => setFeito(null)}>
            Cadastrar outro
          </Button>
          <Link href={voltar.href} className={buttonVariants({ size: "42" })}>
            {voltar.rotulo}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const nome = String(f.get("nome") ?? "");
        setErro(null);
        iniciar(async () => {
          const r = await acaoCadastrarMembro({ nome, email: String(f.get("email") ?? ""), papel, grupoIds });
          if (!r.ok) return setErro(r.erro);
          setGrupoIds([]);
          setFeito({ nome: nome.trim(), ...r.dados });
        });
      }}
    >
      <Campo rotulo="Nome completo" name="nome" required minLength={2} maxLength={120} autoComplete="off" />
      <Campo rotulo="E-mail" name="email" type="email" required maxLength={254} autoComplete="off" />
      {papeis.length > 1 && (
        <CampoMoldura id="papel" rotulo="Papel" ajuda="Admin gerencia conteúdo e alunos. Para tornar alguém Dono, use “Mudar papel” na lista.">
          <GrupoChips id="papel" aria-labelledby="papel-rotulo" opcoes={papeis.map((p) => ({ valor: p, rotulo: ROTULO_PAPEL[p] }))} valor={papel} onMudar={setPapel} />
        </CampoMoldura>
      )}
      {grupos.length > 0 && (
        <fieldset className="m-0 flex flex-col border-0 p-0">
          <legend className="mb-1 text-[13px] font-semibold">Grupos de acesso</legend>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
            {grupos.map((g) => (
              <CaixaSelecao
                key={g.id}
                rotulo={g.nome}
                checked={grupoIds.includes(g.id)}
                onChange={(e) => setGrupoIds((ids) => (e.target.checked ? [...ids, g.id] : ids.filter((x) => x !== g.id)))}
                className="text-text"
              />
            ))}
          </div>
        </fieldset>
      )}
      {erro && (
        <p role="alert" className="m-0 text-[13px] font-semibold text-warn">
          {erro}
        </p>
      )}
      <Button type="submit" size="42" carregando={pendente} className="self-start">
        {textoEnviar}
      </Button>
    </form>
  );
}
