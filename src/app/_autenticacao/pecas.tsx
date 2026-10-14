import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";

/** Titulo + linha de apoio de toda tela de entrada (h1 serifado). */
export function CabecalhoEntrada({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="m-0 text-[32px] desk:text-[36px]">{titulo}</h1>
      {children && <p className="m-0 text-sm leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

/** "Voltar ao login" discreto (alvo de 44px). */
export function LinkVoltarLogin() {
  return (
    <Link
      href="/login"
      className="group mx-auto inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-muted transition-colors duration-150 hover:text-text"
    >
      <ArrowLeft className="size-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden />
      Voltar ao login
    </Link>
  );
}

/** Linha de confianca no pe do formulario. */
export function LinhaConfianca({ children = "Conexão segura" }: { children?: ReactNode }) {
  return (
    <p className="m-0 flex items-center justify-center gap-1.5 text-xs text-muted">
      <Lock className="size-3" aria-hidden />
      {children}
    </p>
  );
}
