import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { destinoSeguro } from "@/lib/auth/destino";
import { obterSessaoDeSeguranca } from "@/lib/auth/sessao";
import { hostAtual } from "@/lib/criador/atual";
import { MolduraAutenticacao } from "../../_autenticacao/moldura-autenticacao";
import { FormVerificar } from "./form-verificar";

export const metadata: Metadata = { title: "Confirme que é você" };

/**
 * Passo 2 da entrada (quem tem segundo fator): codigo do aplicativo ou de recuperacao.
 * Sem o desafio aberto pela senha (cookie de 5 min), a action recusa com a mesma mensagem.
 */
async function Verificar({ searchParams }: { searchParams: PageProps<"/login/verificar">["searchParams"] }) {
  const alvo = await hostAtual();
  // Com sessao (plena ou provisoria) o codigo seguiria o caminho do CADASTRO, nao o da entrada.
  const sessao = await obterSessaoDeSeguranca();
  if (sessao) redirect(sessao.provisoria ? "/conta/seguranca" : "/");
  const destino = destinoSeguro((await searchParams).de);
  return (
    <MolduraAutenticacao alvo={alvo}>
      <FormVerificar destino={destino === "/" ? undefined : destino} />
    </MolduraAutenticacao>
  );
}

export default function PaginaVerificar({ searchParams }: PageProps<"/login/verificar">) {
  return (
    <Suspense fallback={null}>
      <Verificar searchParams={searchParams} />
    </Suspense>
  );
}
