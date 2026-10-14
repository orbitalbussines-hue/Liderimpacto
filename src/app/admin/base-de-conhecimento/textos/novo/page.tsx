import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao } from "@/components/ui/cartao";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { cursosDoCriador } from "@/lib/conhecimento/consultas";
import { ROTA_BASE } from "../../_components/comum";
import { FormTexto } from "../../_components/form-texto";

export const metadata: Metadata = { title: "Novo texto · Base de conhecimento" };

async function Formulario() {
  const { criador } = await membroDaPagina(EQUIPE);
  const cursos = await cursosDoCriador(criador.id);
  return (
    <Cartao padding={24} como="section" aria-label="Texto da base" className="max-w-[860px]">
      <FormTexto cursos={cursos} />
    </Cartao>
  );
}

/** Novo texto da equipe na Base de conhecimento (DONO e ADMIN). */
export default function PaginaNovoTexto() {
  return (
    <div className="flex flex-col gap-5">
      <Link href={ROTA_BASE} className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Base de conhecimento
      </Link>
      <CabecalhoPagina
        variante="admin"
        titulo="Novo texto"
        descricao="Escreva o que o assistente deve saber e não está nas aulas: perguntas frequentes, política de certificados, sobre o professor."
      />
      <Suspense fallback={null}>
        <Formulario />
      </Suspense>
    </div>
  );
}
