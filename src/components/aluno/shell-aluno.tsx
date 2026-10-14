import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";
import { Logo } from "@/components/marca/logo";
import { EstiloMarca } from "@/components/marca/estilo-marca";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SinoNotificacoes } from "@/components/notificacoes/sino-notificacoes";
import { MenuAluno } from "./menu-aluno";
import { TabBarAluno } from "./tab-bar-aluno";

export interface UsuarioShell {
  nome: string;
  iniciais: string;
  avatarUrl?: string;
}

export interface ShellAlunoProps {
  usuario: UsuarioShell;
  /** Contagem inicial do sino (depois o cliente segue por polling); 0 esconde a bolinha. */
  notificacoes: number;
  /** Cor da marca em hex (EstiloMarca); sem ela vale o dourado padrão. */
  corMarca?: string;
  children: ReactNode;
}

/**
 * Casca da área do aluno: header sticky (logo, menu, busca, sino, avatar), conteúdo e,
 * no celular, a tab bar. `data-area="aluno"` é o escopo da cor da marca.
 */
export function ShellAluno({ usuario, notificacoes, corMarca, children }: ShellAlunoProps) {
  return (
    <div data-area="aluno" className="flex min-h-dvh flex-col bg-bg text-text">
      <EstiloMarca cor={corMarca} />
      <header className="sticky top-0 z-20 flex h-[68px] items-center gap-1.5 overflow-hidden bg-[linear-gradient(180deg,var(--bg)_20%,transparent)] px-4 backdrop-blur-sm min-[380px]:px-5 desk:gap-5 desk:px-10">
        <Link href="/" aria-label="Início" className="shrink-0">
          {/* Abaixo de 380px o logo encolhe para o avatar caber em celular de 320px. */}
          <Logo variante="cabecalho" className="text-base min-[380px]:text-xl" />
        </Link>
        <MenuAluno />
        <div className="flex-1" />
        <Button variant="fantasma" size="icone44" aria-label="Buscar" className="min-w-11 shrink-0">
          <Search aria-hidden />
        </Button>
        <SinoNotificacoes inicial={notificacoes} />
        <Link href="/perfil" aria-label="Meu perfil" className="flex shrink-0 items-center gap-1.5">
          <Avatar nome={usuario.nome} src={usuario.avatarUrl} tamanho={36} forma="quadrado" tom="dourado" />
          <ChevronDown aria-hidden className="hidden size-3.5 text-muted desk:block" />
        </Link>
      </header>
      <main className="flex-1 px-5 pt-6 pb-[90px] desk:px-10 desk:pt-11 desk:pb-12">{children}</main>
      <TabBarAluno />
    </div>
  );
}
