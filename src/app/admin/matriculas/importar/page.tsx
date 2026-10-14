import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao } from "@/components/ui/cartao";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { produtosParaMatricular } from "@/lib/matriculas/consultas";
import { MAX_LINHAS_CSV } from "@/lib/membros/csv";
import { ImportarMatriculas } from "./importar-matriculas";

export const metadata: Metadata = { title: "Importar matrículas" };

/** Confere a equipe e entrega os produtos DESTE criador para a prévia (a action confere de novo). */
async function Importador() {
  const { criador } = await membroDaPagina(EQUIPE);
  const produtos = await produtosParaMatricular(criador.id);
  return <ImportarMatriculas produtos={produtos.map((p) => ({ id: p.id, titulo: p.titulo, codigo: p.codigo, slug: p.slug }))} />;
}

export default function PaginaImportarMatriculas() {
  return (
    <div className="flex max-w-[860px] flex-col gap-5">
      <Link href="/admin/matriculas" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Matrículas
      </Link>
      <CabecalhoPagina
        variante="admin"
        titulo="Importar matrículas (CSV)"
        descricao={`Arquivo .csv de até 1 MB e ${MAX_LINHAS_CSV} linhas, com o cabeçalho nome,email,produto,expira_em,grupo. Produto pelo código ("164") ou pelo endereço; expira_em (DD/MM/AAAA) e grupo são opcionais. Uma linha por produto. Quem ainda não é membro entra como Aluno.`}
      />
      <Cartao padding={24}>
        <Suspense fallback={null}>
          <Importador />
        </Suspense>
      </Cartao>
    </div>
  );
}
