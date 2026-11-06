import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { hostAtual } from "@/lib/criador/atual";
import { MolduraAutenticacao } from "../_autenticacao/moldura-autenticacao";
import { FormResgatarPedido } from "./form-resgatar-pedido";

export const metadata: Metadata = { title: "Resgatar meu acesso", robots: { index: false } };

async function Resgatar({ searchParams }: { searchParams: PageProps<"/resgatar-pedido">["searchParams"] }) {
  const alvo = await hostAtual();
  if (alvo.tipo !== "criador") notFound();
  // `?codigo=` abre na aba do código já preenchida (link que a equipe manda); nada é resgatado sem o clique.
  const { codigo } = await searchParams;
  return (
    <MolduraAutenticacao alvo={alvo}>
      <FormResgatarPedido codigoInicial={typeof codigo === "string" ? codigo.slice(0, 40) : ""} />
    </MolduraAutenticacao>
  );
}

/**
 * Resgate PÚBLICO (RN-262, RN-266): quem comprou no Mercado Livre/TikTok Shop (pedido + CPF, via Bling) ou
 * recebeu um código (ex.: chat da Amazon) libera o curso e ganha a conta sem login prévio.
 */
export default function PaginaResgatarPedido({ searchParams }: PageProps<"/resgatar-pedido">) {
  return (
    <Suspense fallback={null}>
      <Resgatar searchParams={searchParams} />
    </Suspense>
  );
}
