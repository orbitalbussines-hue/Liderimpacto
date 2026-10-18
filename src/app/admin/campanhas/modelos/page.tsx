import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { buttonVariants } from "@/components/ui/button";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { listarModelos } from "@/lib/marketing/consultas";
import { dataHoraCurta } from "../../conteudos/_components/comum";
import { AcoesModelo } from "../_components/acoes-modelo";
import { ABAS_CAMPANHAS } from "../_components/comum";

export const metadata: Metadata = { title: "Modelos de e-mail" };

const COLUNAS: Coluna[] = [
  { titulo: "Modelo" },
  { titulo: "Atualizado em", largura: 150 },
  { titulo: "Ações", largura: 56 },
];

async function Modelos() {
  const { criador } = await membroDaPagina(EQUIPE);
  const modelos = await listarModelos(criador.id);
  const linhas: Linha[] = modelos.map((m) => [
    {
      tipo: "no",
      conteudo: (
        <div className="min-w-0">
          <Link href={`/admin/campanhas/modelos/${m.id}`} className="block truncate font-bold text-text hover:underline">
            {m.nome}
          </Link>
          <div className="truncate text-xs text-muted">{m.conteudo.assunto}</div>
        </div>
      ),
    },
    { tipo: "data", texto: dataHoraCurta(m.versao) },
    { tipo: "no", conteudo: <AcoesModelo modelo={{ id: m.id, nome: m.nome, versao: m.versao.toISOString() }} /> },
  ]);
  return (
    <PaginaTabela
      titulo="Campanhas"
      estatistica={`${modelos.length} ${modelos.length === 1 ? "modelo" : "modelos"} · texto pronto para copiar em campanhas e automações`}
      abas={ABAS_CAMPANHAS}
      abaAtiva="Modelos"
      semBusca
      acoes={
        <Link href="/admin/campanhas/modelos/novo" className={buttonVariants({ variant: "primario", size: "36" })}>
          <Plus className="size-3.5" aria-hidden />
          Novo modelo
        </Link>
      }
      colunas={COLUNAS}
      linhas={linhas}
      chaves={modelos.map((m) => m.id)}
      vazio={{ titulo: "Nenhum modelo ainda", descricao: "Guarde um e-mail que você manda sempre (convite de live, boas-vindas) e use de novo sem reescrever." }}
    />
  );
}

/** Modelos de e-mail do criador do HOST (DONO e ADMIN), RN-220. */
export default function PaginaModelos() {
  return (
    <Suspense fallback={null}>
      <Modelos />
    </Suspense>
  );
}
