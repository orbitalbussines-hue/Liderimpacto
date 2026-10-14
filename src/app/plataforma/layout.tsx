import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/marca/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import { sair } from "@/lib/actions/auth";

export const metadata: Metadata = { title: "Plataforma", robots: { index: false } };

/**
 * Casca mínima da área da PLATAFORMA (apex, só SUPER_ADMIN). Só apresentação: cada página
 * confere a sessão por conta própria (superAdminDaPagina + apex).
 */
export default function LayoutPlataforma({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="sticky top-0 z-10 border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-3 px-5">
          <Link href="/plataforma" aria-label="Plataforma: início" className="flex items-center gap-2.5">
            <Logo />
            <Selo tom="neutro" forma="etiqueta">
              Plataforma
            </Selo>
          </Link>
          <div className="flex-1" />
          <Link href="/conta/seguranca" aria-label="Conta e segurança" className={buttonVariants({ variant: "fantasma", size: "icone36", className: "text-muted" })}>
            <ShieldCheck aria-hidden />
          </Link>
          <form action={sair}>
            <Button type="submit" variant="fantasma" size="icone36" aria-label="Sair" className="text-muted">
              <LogOut aria-hidden />
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex max-w-[1200px] flex-col gap-5 px-5 py-8 desk:py-10">{children}</main>
    </div>
  );
}
