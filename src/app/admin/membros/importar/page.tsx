import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao } from "@/components/ui/cartao";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { MAX_LINHAS_CSV } from "@/lib/membros/csv";
import { ImportarCsv } from "./importar-csv";

export const metadata: Metadata = { title: "Importar membros" };

/** Confere a equipe antes de montar a tela (a action confere de novo). */
async function Importador() {
  await membroDaPagina(EQUIPE);
  return <ImportarCsv />;
}

export default function PaginaImportarMembros() {
  return (
    <div className="flex max-w-[860px] flex-col gap-5">
      <Link href="/admin/membros" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Membros
      </Link>
      <CabecalhoPagina
        variante="admin"
        titulo="Importar membros (CSV)"
        descricao={`Arquivo .csv de até 1 MB e ${MAX_LINHAS_CSV} linhas, com o cabeçalho nome,email,grupo (grupo é opcional; se não existir, vira uma Turma). Todos entram como Aluno. Para matricular em cursos, use Matrículas › Importar CSV.`}
      />
      <Cartao padding={24}>
        <Suspense fallback={null}>
          <Importador />
        </Suspense>
      </Cartao>
    </div>
  );
}
