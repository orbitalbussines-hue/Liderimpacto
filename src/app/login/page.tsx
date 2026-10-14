import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { destinoSeguro } from "@/lib/auth/destino";
import { obterSessaoDeSeguranca } from "@/lib/auth/sessao";
import { hostAtual } from "@/lib/criador/atual";
import { MolduraAutenticacao } from "../_autenticacao/moldura-autenticacao";
import { FormLogin } from "./_components/form-login";

export const metadata: Metadata = { title: "Entrar" };

/**
 * Login de CADA host: no criador exige vinculo ativo naquele criador; no apex, so
 * SUPER_ADMIN. Quem decide e o servidor (login.ts + funil de sessao), nao esta tela.
 * Nao existe cadastro publico.
 */
async function Login({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const alvo = await hostAtual(); // host que nao e area: 404
  const sessao = await obterSessaoDeSeguranca();
  if (sessao) redirect(sessao.provisoria ? "/conta/seguranca" : alvo.tipo === "plataforma" ? "/plataforma" : "/");
  const { de } = await searchParams;
  const destino = destinoSeguro(de);
  return (
    <MolduraAutenticacao alvo={alvo}>
      <FormLogin destino={destino === "/" ? undefined : destino} plataforma={alvo.tipo === "plataforma"} />
    </MolduraAutenticacao>
  );
}

// Host, cookie e searchParams so dentro de <Suspense> (cacheComponents).
export default function PaginaLogin({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={null}>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}
