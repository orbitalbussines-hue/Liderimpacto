import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao } from "@/components/ui/cartao";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { listarGrupos } from "@/lib/membros/consultas";
import { papeisQuePodeCadastrar } from "@/lib/membros/regras";
import { FormCadastrarMembro } from "./form-cadastrar-membro";

export const metadata: Metadata = { title: "Cadastrar membro" };

async function Formulario() {
  const { criador, membro } = await membroDaPagina(EQUIPE);
  const grupos = await listarGrupos(criador.id);
  return (
    <FormCadastrarMembro papeis={papeisQuePodeCadastrar(membro.papel)} grupos={grupos.map((g) => ({ id: g.id, nome: g.nome }))} area={criador.nome} />
  );
}

export default function PaginaCadastrarMembro() {
  return (
    <div className="flex max-w-[680px] flex-col gap-5">
      <Link href="/admin/membros" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Membros
      </Link>
      <CabecalhoPagina
        variante="admin"
        titulo="Cadastrar membro"
        descricao="A pessoa recebe um link de primeiro acesso e escolhe a própria senha. Se o e-mail já tiver conta na plataforma, ela entra com a senha que já usa."
      />
      <Cartao padding={24}>
        <Suspense fallback={null}>
          <Formulario />
        </Suspense>
      </Cartao>
    </div>
  );
}
