import type { Metadata } from "next";
import { Suspense } from "react";
import { VerificacaoPublicaCertificado } from "@/components/certificados/verificacao-publica";
import { EstiloMarca } from "@/components/marca/estilo-marca";
import { Logo } from "@/components/marca/logo";
import { AlternarTema } from "@/components/ui/alternar-tema";
import { Esqueleto } from "@/components/ui/esqueleto";
import { verificarPublico } from "@/lib/certificados/consultas";
import { criadorAtual } from "@/lib/criador/atual";

export const metadata: Metadata = {
  title: "Verificação de certificado",
  robots: { index: false, follow: false, nocache: true },
};

type Params = Promise<{ codigo: string }>;

async function Verificacao({ params }: { params: Params }) {
  const { codigo } = await params;
  const criador = await criadorAtual(); // criador do HOST; código de outro criador = não encontrado
  const pedido = codigo.slice(0, 40);
  const certificado = await verificarPublico(criador.id, pedido);
  return (
    <>
      <EstiloMarca cor={criador.cor_marca} />
      <VerificacaoPublicaCertificado certificado={certificado} codigoPedido={pedido} hrefPdf={`/certificado/${certificado?.codigo ?? ""}/pdf`} />
      <p className="m-0 mt-10 text-center text-xs text-muted">
        Página pública de verificação de {criador.nome}. Os dados vêm do registro original do certificado.
      </p>
    </>
  );
}

/**
 * Verificação PÚBLICA do certificado (QR do PDF): sem login, criador pelo host, `noindex`.
 * Só o que `verificarPublico` devolve (RN-129). Fora do grupo do aluno: não exige sessão.
 */
export default function PaginaVerificacao({ params }: { params: Params }) {
  return (
    <div data-area="aluno" className="relative isolate min-h-dvh overflow-hidden bg-bg text-text">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] cena-luz-marca cena-aurora opacity-35 [[data-theme=light]_&]:opacity-20" />
      <header className="mx-auto flex h-[68px] max-w-[880px] items-center justify-between px-5">
        <Logo />
        <AlternarTema />
      </header>
      <main className="mx-auto max-w-[680px] px-5 pt-8 pb-16 desk:pt-14">
        <Suspense
          fallback={
            <div aria-busy className="flex flex-col items-center gap-5">
              <span className="sr-only">Verificando o certificado</span>
              <Esqueleto className="size-16 rounded-full" />
              <Esqueleto className="h-10 w-72" />
              <Esqueleto className="h-[320px] w-full rounded-[18px]" />
            </div>
          }
        >
          <Verificacao params={params} />
        </Suspense>
      </main>
    </div>
  );
}
