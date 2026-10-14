import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao } from "@/components/ui/cartao";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { opcoesDeMeta } from "@/lib/gamificacao/admin";
import { listarGrupos } from "@/lib/membros/consultas";
import { FormDesafio } from "../_components/form-desafio";

export const metadata: Metadata = { title: "Novo desafio" };

async function Formulario() {
  const { criador } = await membroDaPagina(EQUIPE);
  const [metas, grupos] = await Promise.all([opcoesDeMeta(criador.id), listarGrupos(criador.id)]);
  return (
    <Cartao padding={24} como="section" aria-label="Dados do desafio" className="max-w-[760px]">
      <FormDesafio opcoes={{ ...metas, grupos: grupos.map((g) => ({ id: g.id, nome: g.nome })) }} />
    </Cartao>
  );
}

/** Criar desafio (DONO e ADMIN): nasce em rascunho; publicar é no editor. */
export default function PaginaNovoDesafio() {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/desafios" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Desafios
      </Link>
      <CabecalhoPagina variante="admin" titulo="Novo desafio" descricao="Uma meta com prazo. O desafio nasce como rascunho: os alunos só o veem depois de publicado." />
      <Suspense fallback={null}>
        <Formulario />
      </Suspense>
    </div>
  );
}
