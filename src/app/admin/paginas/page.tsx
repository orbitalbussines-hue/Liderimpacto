import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { enderecoDaArea } from "@/lib/criador/area";
import { listarPaginas } from "@/lib/paginas/consultas";
import { ROTULO_MODELO } from "@/lib/paginas/modelos";
import { dataHoraCurta } from "../conteudos/_components/comum";
import { AcoesPagina } from "./_components/acoes-pagina";
import { ABAS_PAGINAS, situacaoDaPagina } from "./_components/comum";
import { NovaPagina } from "./_components/nova-pagina";

export const metadata: Metadata = { title: "Páginas" };

const COLUNAS: Coluna[] = [
  { titulo: "Página" },
  { titulo: "Endereço", largura: 200 },
  { titulo: "Situação", largura: 190 },
  { titulo: "Visitas 30 dias", largura: 130, alinhar: "direita" },
  { titulo: "Leads", largura: 90, alinhar: "direita" },
  { titulo: "Atualização", largura: 130 },
  { titulo: "Ações", largura: 56 },
];

async function Paginas() {
  const { criador } = await membroDaPagina(EQUIPE);
  const paginas = await listarPaginas(criador.id);
  const area = enderecoDaArea(criador.slug).url;
  const linhas: Linha[] = paginas.map((p) => {
    const s = situacaoDaPagina(p.situacao, p.alterada, p.publicacoes);
    return [
      {
        tipo: "no",
        conteudo: (
          <div className="min-w-0">
            <Link href={`/admin/paginas/${p.id}`} className="block truncate font-bold text-text hover:underline">
              {p.titulo}
            </Link>
            <div className="truncate text-xs text-muted">{ROTULO_MODELO[p.modelo].titulo}</div>
          </div>
        ),
      },
      { tipo: "no", conteudo: <span className="block truncate text-[13px] text-muted">/p/{p.slug}</span> },
      { tipo: "selo", texto: s.texto, tom: s.tom },
      { tipo: "no", conteudo: <span className="tabular-nums">{p.visitas.toLocaleString("pt-BR")}</span> },
      { tipo: "no", conteudo: <span className="tabular-nums">{p.leads.toLocaleString("pt-BR")}</span> },
      { tipo: "data", texto: dataHoraCurta(p.atualizadaEm) },
      { tipo: "no", conteudo: <AcoesPagina pagina={{ id: p.id, titulo: p.titulo, situacao: p.situacao, versao: p.versao }} url={`${area}/p/${p.slug}`} /> },
    ];
  });
  const publicadas = paginas.filter((p) => p.situacao === "PUBLICADA").length;
  return (
    <PaginaTabela
      titulo="Páginas"
      estatistica={
        <>
          {paginas.length} {paginas.length === 1 ? "página" : "páginas"} · <b className="text-ok">{publicadas} no ar</b>
        </>
      }
      abas={ABAS_PAGINAS}
      abaAtiva="Páginas"
      semBusca
      acoes={<NovaPagina endereco={area} />}
      colunas={COLUNAS}
      linhas={linhas}
      chaves={paginas.map((p) => p.id)}
      vazio={{ titulo: "Nenhuma página ainda", descricao: "Crie uma página de vendas do curso ou de captura de e-mail a partir de um modelo pronto." }}
    />
  );
}

/** Páginas de venda e captura do criador do HOST (DONO e ADMIN), RN-240. */
export default function PaginaPaginas() {
  return (
    <Suspense fallback={null}>
      <Paginas />
    </Suspense>
  );
}
