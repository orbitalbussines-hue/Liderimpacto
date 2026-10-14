import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";

export interface CabecalhoConfiguracaoProps {
  titulo: string;
  descricao: ReactNode;
  acoes?: ReactNode;
}

/** Topo das telas de Configurações: "← Configurações" + cabeçalho do admin. */
export function CabecalhoConfiguracao({ titulo, descricao, acoes }: CabecalhoConfiguracaoProps) {
  return (
    <>
      <Link href="/admin/configuracoes" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Configurações
      </Link>
      <CabecalhoPagina variante="admin" titulo={titulo} descricao={descricao} acoes={acoes} />
    </>
  );
}
