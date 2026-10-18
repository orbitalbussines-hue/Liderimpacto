import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { listarFunis, paginasParaFunil } from "@/lib/paginas/consultas";
import { percentual, textoPercentual } from "@/lib/paginas/metricas";
import { dataHoraCurta } from "../conteudos/_components/comum";
import { NovoFunil } from "./_components/botoes-funil";

export const metadata: Metadata = { title: "Funis" };

const COLUNAS: Coluna[] = [
  { titulo: "Funil" },
  { titulo: "Etapas", largura: 90, alinhar: "direita" },
  { titulo: "Visitas 30 dias", largura: 130, alinhar: "direita" },
  { titulo: "Leads", largura: 90, alinhar: "direita" },
  { titulo: "Vendas", largura: 90, alinhar: "direita" },
  { titulo: "Conversão", largura: 110, alinhar: "direita" },
];

async function Funis() {
  const { criador } = await membroDaPagina(EQUIPE);
  const [funis, paginas] = await Promise.all([listarFunis(criador.id), paginasParaFunil(criador.id)]);
  const n = (x: number) => <span className="tabular-nums">{x.toLocaleString("pt-BR")}</span>;
  const linhas: Linha[] = funis.map((f) => [
    {
      tipo: "no",
      conteudo: (
        <div className="min-w-0">
          <Link href={`/admin/funis/${f.id}`} className="block truncate font-bold text-text hover:underline">
            {f.nome}
          </Link>
          <div className="truncate text-xs text-muted">Criado em {dataHoraCurta(f.criadoEm)}</div>
        </div>
      ),
    },
    { tipo: "no", conteudo: n(f.etapas) },
    { tipo: "no", conteudo: n(f.visitas) },
    { tipo: "no", conteudo: n(f.leads) },
    { tipo: "no", conteudo: n(f.vendas) },
    { tipo: "no", conteudo: <span className="tabular-nums">{textoPercentual(percentual(f.vendas, f.visitas))}</span> },
  ]);
  return (
    <PaginaTabela
      titulo="Funis"
      estatistica={`${funis.length} ${funis.length === 1 ? "funil" : "funis"} · números dos últimos 30 dias`}
      abas={["Funis"]}
      semBusca
      acoes={<NovoFunil paginas={paginas} />}
      colunas={COLUNAS}
      linhas={linhas}
      chaves={funis.map((f) => f.id)}
      vazio={{ titulo: "Nenhum funil ainda", descricao: "Um funil liga páginas em sequência (captura → vendas → obrigado) e mostra quantas pessoas passam de uma etapa para a outra." }}
    />
  );
}

/** Funis do criador do HOST (DONO e ADMIN), RN-245/RN-246. */
export default function PaginaFunis() {
  return (
    <Suspense fallback={null}>
      <Funis />
    </Suspense>
  );
}
