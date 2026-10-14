import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao } from "@/components/ui/cartao";
import { membroDaPagina } from "@/lib/auth/guarda";
import { FormCadastrarMembro } from "../../../membros/cadastrar/form-cadastrar-membro";

export const metadata: Metadata = { title: "Convidar administrador" };

/** So DONO. Reusa o cadastro de membro com o papel ADMIN fixo (a action confere o papel de novo). */
async function Formulario() {
  const { criador } = await membroDaPagina(["DONO"]);
  return (
    <FormCadastrarMembro
      papeis={["ADMIN"]}
      grupos={[]}
      area={criador.nome}
      voltar={{ href: "/admin/configuracoes/equipe", rotulo: "Ver equipe" }}
      textoEnviar="Convidar"
    />
  );
}

export default function PaginaConvidarAdministrador() {
  return (
    <div className="flex max-w-[680px] flex-col gap-5">
      <Link href="/admin/configuracoes/equipe" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Equipe e acesso
      </Link>
      <CabecalhoPagina
        variante="admin"
        titulo="Convidar administrador"
        descricao="Admin gerencia conteúdos, membros e matrículas; não vê financeiro, equipe nem configurações. A pessoa recebe um link de primeiro acesso e escolhe a própria senha. Se o e-mail já tiver conta na plataforma, ela entra com a senha que já usa."
      />
      <Cartao padding={24}>
        <Suspense fallback={null}>
          <Formulario />
        </Suspense>
      </Cartao>
    </div>
  );
}
