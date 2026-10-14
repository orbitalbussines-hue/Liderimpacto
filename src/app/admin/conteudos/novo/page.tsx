import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao } from "@/components/ui/cartao";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { FormNovoProduto } from "./form-novo-produto";

export const metadata: Metadata = { title: "Novo produto" };

/** A página confere o papel por conta própria (o layout não é fronteira). */
async function Formulario() {
  await membroDaPagina(EQUIPE);
  return <FormNovoProduto />;
}

export default function PaginaNovoProduto() {
  return (
    <div className="flex max-w-[680px] flex-col gap-5">
      <Link href="/admin/conteudos" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Conteúdos
      </Link>
      <CabecalhoPagina
        variante="admin"
        titulo="Novo produto"
        descricao="O produto nasce em rascunho. Depois você monta os módulos e aulas, envia as capas e publica."
      />
      <Cartao padding={24}>
        <Suspense fallback={null}>
          <Formulario />
        </Suspense>
      </Cartao>
    </div>
  );
}
