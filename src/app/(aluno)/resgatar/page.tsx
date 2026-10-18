import type { Metadata } from "next";
import { Suspense } from "react";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Esqueleto } from "@/components/ui/esqueleto";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { FormularioResgate } from "./_components/formulario-resgate";

export const metadata: Metadata = { title: "Resgatar voucher" };

type Busca = Promise<Record<string, string | string[] | undefined>>;

/**
 * Resgatar voucher (RN-201): o membro da SESSÃO digita o código e ganha os cursos. `?codigo=`
 * preenche o campo (link que a equipe manda), mas o resgate só acontece no clique.
 */
async function Resgatar({ searchParams }: { searchParams: Busca }) {
  const [sp, q] = await Promise.all([searchParams, membroDaPagina(TODOS_OS_MEMBROS)]);
  const codigo = typeof sp.codigo === "string" ? sp.codigo.slice(0, 40) : "";
  return (
    <>
      <CabecalhoPagina titulo="Resgatar voucher" descricao={`Recebeu um código da equipe da ${q.criador.nome}? Digite aqui para liberar seus cursos.`} />
      <FormularioResgate codigoInicial={codigo} />
    </>
  );
}

export default function PaginaResgatar({ searchParams }: { searchParams: Busca }) {
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-[22px]">
      <Suspense
        fallback={
          <div aria-busy="true" className="flex flex-col gap-[22px]">
            <span className="sr-only">Carregando</span>
            <Esqueleto className="h-10 w-64 max-w-full" />
            <Esqueleto className="h-[180px] rounded-2xl" />
          </div>
        }
      >
        <Resgatar searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
