import type { Metadata } from "next";
import { Suspense } from "react";
import { hostAtual } from "@/lib/criador/atual";
import { MolduraAutenticacao } from "../_autenticacao/moldura-autenticacao";
import { FormRecuperar } from "./form-recuperar";

export const metadata: Metadata = { title: "Esqueci a senha" };

async function Recuperar({ searchParams }: { searchParams: PageProps<"/recuperar-senha">["searchParams"] }) {
  const alvo = await hostAtual();
  // `?primeiro=1` vem do "Primeiro acesso? Criar minha senha" do login: so muda o texto.
  const { primeiro } = await searchParams;
  return (
    <MolduraAutenticacao alvo={alvo}>
      <FormRecuperar primeiroAcesso={primeiro === "1"} />
    </MolduraAutenticacao>
  );
}

/** Pede o link de definir senha. A resposta e sempre a mesma, exista ou nao o e-mail. */
export default function PaginaRecuperarSenha({ searchParams }: PageProps<"/recuperar-senha">) {
  return (
    <Suspense fallback={null}>
      <Recuperar searchParams={searchParams} />
    </Suspense>
  );
}
