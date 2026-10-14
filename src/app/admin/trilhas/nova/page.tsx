import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao } from "@/components/ui/cartao";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { FormTrilha } from "../_components/form-trilha";

export const metadata: Metadata = { title: "Nova trilha" };

async function Guarda() {
  await membroDaPagina(EQUIPE);
  return (
    <Cartao padding={24} como="section" aria-label="Dados da trilha" className="max-w-[760px]">
      <FormTrilha />
    </Cartao>
  );
}

/** Criar trilha (DONO e ADMIN): só os dados; as etapas e a capa vêm no editor. */
export default function PaginaNovaTrilha() {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/trilhas" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Trilhas
      </Link>
      <CabecalhoPagina variante="admin" titulo="Nova trilha" descricao="Dê um nome à sequência. Depois você adiciona os cursos e avaliações, na ordem." />
      <Suspense fallback={null}>
        <Guarda />
      </Suspense>
    </div>
  );
}
