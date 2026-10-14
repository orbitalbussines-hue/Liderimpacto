import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/marca/logo";
import { AlternarTema } from "@/components/ui/alternar-tema";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { CursoDemo } from "./_components/curso-demo";
import { EngajamentoDemo } from "./_components/engajamento-demo";
import { VitrineDemo } from "./_components/vitrine-demo";

export const metadata: Metadata = { title: "Compostos do aluno", robots: { index: false } };

/** Catálogo dos compostos da área do aluno (404 em produção, como o /componentes). */
export default function CatalogoAluno() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-14 px-5 py-6 desk:px-10 desk:py-11">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <Logo />
          <AlternarTema />
        </div>
        <CabecalhoPagina
          eyebrow="Design system"
          titulo="Compostos do aluno"
          descricao="Shell, vitrine, curso, player, avaliações, trilhas, certificados, comunidade e perfil, com os dados do protótipo."
          acoes={
            <Link href="/componentes" className={buttonVariants({ variant: "contorno" })}>
              Primitivas
            </Link>
          }
        />
      </div>
      <VitrineDemo />
      <CursoDemo />
      <EngajamentoDemo />
    </div>
  );
}
