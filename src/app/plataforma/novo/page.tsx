import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao } from "@/components/ui/cartao";
import { superAdminDaPagina } from "@/lib/auth/guarda";
import { dominioDaPlataforma } from "@/lib/criador/area";
import { FormNovoCriador } from "./form-novo-criador";

export const metadata: Metadata = { title: "Novo criador" };

async function Formulario() {
  const s = await superAdminDaPagina();
  if (s.alvo.tipo !== "plataforma") notFound();
  return <FormNovoCriador dominio={dominioDaPlataforma()} />;
}

export default function PaginaNovoCriador() {
  return (
    <div className="flex max-w-[680px] flex-col gap-5">
      <Link href="/plataforma" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Criadores
      </Link>
      <CabecalhoPagina
        variante="admin"
        titulo="Novo criador"
        descricao="Cria a área com endereço próprio e o DONO responsável. O DONO recebe um link de primeiro acesso para definir a senha."
      />
      <Cartao padding={24}>
        <Suspense fallback={null}>
          <Formulario />
        </Suspense>
      </Cartao>
    </div>
  );
}
