"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode, Ref } from "react";
import { ChevronRight, Eye, LogOut, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/marca/logo";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { CampoBusca } from "@/components/ui/campo-busca";
import { Selo } from "@/components/ui/selo";
import { sair } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";
import { GRUPOS_NAVEGACAO, RODAPE_NAVEGACAO, itemAtivo, papelPodeVer, type ItemNavegacao, type PapelAdmin } from "./navegacao";

export interface UsuarioAdmin {
  nome: string;
  papel: PapelAdmin;
}

interface Props {
  usuario: UsuarioAdmin;
  /** Chamado ao clicar num link (a gaveta do celular fecha). */
  aoNavegar?: () => void;
  refBusca?: Ref<HTMLInputElement>;
  /** Botão extra no topo (fechar da gaveta). */
  fechar?: ReactNode;
}

const classeItem = (ativo: boolean) =>
  cn(
    "flex min-h-11 w-full items-center gap-2.5 rounded-[9px] px-2.5 py-[9px] text-left text-[13px] font-semibold transition-colors duration-150 desk:min-h-0",
    ativo ? "bg-accent-soft text-accent" : "text-text hover:bg-surface-2"
  );

function LinkItem({ alvo, ativo, aoNavegar, seta }: { alvo: ItemNavegacao; ativo: boolean; aoNavegar?: () => void; seta?: boolean }) {
  const Icone = alvo.icone;
  return (
    <Link href={alvo.href} onClick={aoNavegar} aria-current={ativo ? "page" : undefined} className={classeItem(ativo)}>
      <Icone className={cn("size-4 shrink-0", ativo ? "text-accent" : "text-muted")} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{alvo.rotulo}</span>
      {alvo.selo && (
        <Selo tom={alvo.selo === "Novo" ? "accent" : "transparente"} forma="etiqueta" className="text-[9px]">
          {alvo.selo}
        </Selo>
      )}
      {seta && <ChevronRight className="size-3.5 shrink-0 text-muted" aria-hidden />}
    </Link>
  );
}

/** Conteúdo da navegação lateral: usado na sidebar fixa (desktop) e na gaveta (celular). */
export function SidebarAdmin({ usuario, aoNavegar, refBusca, fechar }: Props) {
  const ativo = itemAtivo(usePathname())?.slug;
  const visivel = (i: ItemNavegacao) => papelPodeVer(usuario.papel, i);

  return (
    <div className="flex min-h-full flex-col gap-1 px-3.5 py-5">
      <div className="flex items-center gap-2.5 px-2 pb-[18px]">
        <Link href="/admin" onClick={aoNavegar} aria-label="Líder de Impacto · início do admin">
          <Logo variante="bloco" tamanho={10} />
        </Link>
        <Selo forma="etiqueta" className="ml-auto">
          Admin
        </Selo>
        {fechar}
      </div>

      <CampoBusca
        ref={refBusca}
        rotulo="Pesquisar no admin"
        sufixo={<kbd className="rounded border border-border px-1.5 py-px font-sans text-[10px]">⌘K</kbd>}
        classNameMoldura="mb-2"
      />

      <nav aria-label="Admin" className="flex flex-col gap-1">
        {GRUPOS_NAVEGACAO.map((grupo) => {
          const itens = grupo.itens.filter(visivel);
          if (itens.length === 0) return null;
          return (
            <div key={grupo.titulo || "inicio"} className="flex flex-col gap-1">
              {grupo.titulo && (
                <p className="m-0 px-2.5 pt-3 pb-1 text-[10px] font-bold tracking-[.1em] text-muted uppercase">
                  {grupo.titulo}
                </p>
              )}
              {itens.map((i) => (
                <LinkItem key={i.slug} alvo={i} ativo={i.slug === ativo} aoNavegar={aoNavegar} />
              ))}
            </div>
          );
        })}
      </nav>

      <div className="min-h-3 flex-1" />

      <div className="flex flex-col gap-0.5 border-t border-border pt-2">
        {RODAPE_NAVEGACAO.filter(visivel).map((i) => (
          <LinkItem key={i.slug} alvo={i} ativo={i.slug === ativo} aoNavegar={aoNavegar} seta />
        ))}
        <Link
          href="/"
          onClick={aoNavegar}
          className="flex min-h-11 items-center gap-2.5 rounded-[9px] px-2.5 py-[9px] text-[13px] font-semibold text-accent transition-colors duration-150 hover:bg-surface-2 desk:min-h-0"
        >
          <Eye className="size-4" aria-hidden />
          Ver como aluno
        </Link>
      </div>

      <div className="mt-2.5 flex items-center gap-2.5 border-t border-border px-2.5 pt-3">
        <Avatar nome={usuario.nome} tamanho={28} tom="accent" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold" aria-hidden>
          {usuario.nome}
        </span>
        <Link
          href="/conta/seguranca"
          onClick={aoNavegar}
          aria-label="Segurança da conta"
          className={buttonVariants({ variant: "fantasma", size: "icone36", className: "text-muted" })}
        >
          <ShieldCheck aria-hidden />
        </Link>
        <form action={sair}>
          <Button type="submit" variant="fantasma" size="icone36" aria-label="Sair" className="text-muted">
            <LogOut aria-hidden />
          </Button>
        </form>
      </div>
    </div>
  );
}
