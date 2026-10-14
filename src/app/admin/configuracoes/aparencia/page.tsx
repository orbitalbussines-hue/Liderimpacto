import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { membroDaPagina } from "@/lib/auth/guarda";
import { marcaDoCriador } from "@/lib/criador/consultas";
import { EditorAparencia } from "./editor-aparencia";

export const metadata: Metadata = { title: "Aparência" };

/** So DONO (ADMIN recebe 403 na trilha). Cor lida do banco agora, com a versao para a trava. */
async function Editor() {
  const { criador } = await membroDaPagina(["DONO"]);
  const marca = await marcaDoCriador(criador.id);
  if (!marca) notFound();
  return <EditorAparencia corInicial={marca.cor} versaoInicial={marca.versao.toISOString()} area={criador.nome} />;
}

export default function PaginaAparencia() {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/configuracoes" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Configurações
      </Link>
      <CabecalhoPagina
        variante="admin"
        titulo="Aparência"
        descricao="A cor da marca vale para toda a área do aluno (vitrine, menu, botões e selos). O painel admin continua no padrão."
      />
      <Suspense fallback={null}>
        <Editor />
      </Suspense>
    </div>
  );
}
