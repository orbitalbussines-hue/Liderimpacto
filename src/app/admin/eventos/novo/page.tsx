import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao } from "@/components/ui/cartao";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { opcoesDoEvento } from "@/lib/eventos/admin";
import { FormEvento } from "../_components/form-evento";

export const metadata: Metadata = { title: "Novo evento" };

async function Formulario() {
  const { criador } = await membroDaPagina(EQUIPE);
  const opcoes = await opcoesDoEvento(criador.id);
  return (
    <Cartao padding={24} como="section" aria-label="Dados do encontro" className="max-w-[760px]">
      <FormEvento opcoes={opcoes} />
    </Cartao>
  );
}

/** Criar evento (DONO e ADMIN): nasce como rascunho; publicar é no editor. */
export default function PaginaNovoEvento() {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/eventos" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Eventos ao vivo
      </Link>
      <CabecalhoPagina variante="admin" titulo="Novo evento" descricao="Aula ao vivo, mentoria em grupo ou live numa sala externa. Fica em rascunho até você publicar." />
      <Suspense fallback={null}>
        <Formulario />
      </Suspense>
    </div>
  );
}
