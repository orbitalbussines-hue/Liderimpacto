"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { LinkDeAcesso } from "@/components/admin/link-de-acesso";
import { Button, buttonVariants } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { acaoCriarCriador } from "@/lib/actions/criadores";
import { slugSchema } from "@/lib/validators/criadores";

type Feito = { nome: string; slug: string; link: { url: string; expiraEm: string } | null; aviso: string | null };

/** Sugestão de endereço a partir do nome: sem acento, minúsculo, hífen no lugar de espaço. */
const sugerirSlug = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);

export function FormNovoCriador({ dominio }: { dominio: string }) {
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEditado, setSlugEditado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<Feito | null>(null);
  const [pendente, iniciar] = useTransition();
  const validacao = slug ? slugSchema.safeParse(slug) : null;
  const erroSlug = validacao && !validacao.success ? validacao.error.issues[0]?.message : undefined;

  if (feito) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="m-0 flex items-center gap-2 text-sm font-semibold text-ok">
          <CheckCircle2 className="size-4" aria-hidden />
          {feito.nome} criado em {feito.slug}.{dominio}.
        </p>
        {feito.link && <LinkDeAcesso url={feito.link.url} expiraEm={feito.link.expiraEm} rotulo="Link de primeiro acesso do DONO" />}
        {feito.aviso && <p className="m-0 rounded-lg border border-border bg-surface-2 p-3 text-[13px]">{feito.aviso}</p>}
        <div className="flex flex-wrap gap-2.5 border-t border-border pt-4">
          <Link href="/plataforma" className={buttonVariants({ size: "42" })}>
            Ver criadores
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
        setErro(null);
        iniciar(async () => {
          const r = await acaoCriarCriador({
            nome,
            slug,
            cor: String(f.get("cor") ?? ""),
            donoNome: String(f.get("donoNome") ?? ""),
            donoEmail: String(f.get("donoEmail") ?? ""),
          });
          if (!r.ok) return setErro(r.erro);
          setFeito({ nome: nome.trim(), slug: r.dados.slug, link: r.dados.link, aviso: r.dados.aviso });
        });
      }}
    >
      <Campo
        rotulo="Nome do criador"
        value={nome}
        onChange={(e) => {
          setNome(e.target.value);
          if (!slugEditado) setSlug(sugerirSlug(e.target.value));
        }}
        required
        maxLength={120}
      />
      <Campo
        rotulo="Endereço"
        value={slug}
        onChange={(e) => {
          setSlugEditado(true);
          setSlug(e.target.value.toLowerCase());
        }}
        required
        maxLength={63}
        spellCheck={false}
        sufixo={<span className="text-[13px]">.{dominio}</span>}
        className="pr-44"
        ajuda="Letras minúsculas, números e hífen. Não dá para trocar depois sem quebrar links."
        erro={erroSlug}
      />
      <Campo rotulo="Cor da marca (opcional)" name="cor" placeholder="#D9A441" maxLength={7} spellCheck={false} ajuda="Hex. Vazio = dourado padrão; o DONO pode trocar depois em Configurações › Aparência." />
      <fieldset className="m-0 flex flex-col gap-4 border-0 border-t border-border p-0 pt-4">
        <legend className="sr-only">Dono</legend>
        <p aria-hidden className="m-0 text-[13px] font-semibold">Dono (responsável)</p>
        <Campo rotulo="Nome do dono" name="donoNome" required minLength={2} maxLength={120} autoComplete="off" />
        <Campo rotulo="E-mail do dono" name="donoEmail" type="email" required maxLength={254} autoComplete="off" />
      </fieldset>
      {erro && (
        <p role="alert" className="m-0 text-[13px] font-semibold text-warn">
          {erro}
        </p>
      )}
      <Button type="submit" size="42" carregando={pendente} disabled={!!erroSlug} className="self-start">
        Criar criador
      </Button>
    </form>
  );
}
