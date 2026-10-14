import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CartaoKpi } from "@/components/admin/cartao-kpi";
import { PaginaCards } from "@/components/admin/pagina-cards";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import { secaoPorSlug } from "@/components/admin/navegacao";
import { SeletorPeriodo } from "@/components/admin/seletor-periodo";
import { ShellAdmin } from "@/components/admin/shell-admin";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "../_components/secao";
import { KPIS_DASHBOARD, LINHAS_CONTEUDOS, LINHAS_MATRICULAS, LINHAS_MEMBROS } from "./dados";

export const metadata: Metadata = { title: "Componentes · Admin", robots: { index: false } };

/** Catálogo dos moldes do admin. Só em desenvolvimento (produção = 404), igual ao /componentes. */
export default function CatalogoAdmin() {
  if (process.env.NODE_ENV === "production") notFound();

  const conteudos = secaoPorSlug("conteudos")!.molde;
  const membros = secaoPorSlug("membros")!.molde;
  const matriculas = secaoPorSlug("matriculas")!.molde;
  const config = secaoPorSlug("configuracoes")!.molde;
  if (conteudos.tipo !== "tabela" || membros.tipo !== "tabela" || matriculas.tipo !== "tabela" || config.tipo !== "cards") {
    throw new Error("navegacao.ts mudou: ajuste o catálogo do admin");
  }

  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-14 px-5 py-6 desk:px-10 desk:py-11">
      <CabecalhoPagina
        eyebrow="Design system"
        titulo="Compostos do admin"
        descricao="Casca e moldes de página. Tela nova do admin = uma entrada em components/admin/navegacao.ts."
        acoes={
          <Link href="/componentes" className={buttonVariants({ variant: "contorno", size: "40" })}>
            Primitivas
          </Link>
        }
      />

      <Secao id="pagina-tabela" titulo="PaginaTabela · Conteúdos" arquivo="admin/pagina-tabela.tsx · celula-tabela.tsx">
        <PaginaTabela
          titulo={conteudos.titulo}
          abas={conteudos.abas}
          busca={conteudos.busca}
          filtros={conteudos.filtros}
          colunas={conteudos.colunas}
          linhas={LINHAS_CONTEUDOS}
          acaoSecundaria={conteudos.acaoSecundaria}
          acaoPrincipal={conteudos.acaoPrincipal}
          paginacao={{ pagina: 1, porPagina: 10, total: 3 }}
        />
      </Secao>

      <Secao id="pagina-tabela-membros" titulo="PaginaTabela · Membros" arquivo="filtro ativo, último acesso Nunca">
        <PaginaTabela
          titulo={membros.titulo}
          estatistica={
            <>
              139 total · <b className="text-ok">137 ativos</b> · 2 inativos · 59 nunca acessaram
            </>
          }
          abas={membros.abas}
          busca={membros.busca}
          filtros={membros.filtros}
          filtrosAtivos={[{ rotulo: "Status · Ativo", hrefRemover: "/componentes/admin" }]}
          colunas={membros.colunas}
          linhas={LINHAS_MEMBROS}
          acaoSecundaria={membros.acaoSecundaria}
          acaoPrincipal={membros.acaoPrincipal}
          paginacao={{ pagina: 1, porPagina: 10, total: 137 }}
        />
      </Secao>

      <Secao id="pagina-tabela-barra" titulo="PaginaTabela · célula barra" arquivo="Matrículas">
        <PaginaTabela
          titulo={matriculas.titulo}
          estatistica="69 total · 0 pendentes · 68 aprovadas"
          abas={matriculas.abas}
          colunas={matriculas.colunas}
          linhas={LINHAS_MATRICULAS}
          acaoPrincipal={matriculas.acaoPrincipal}
        />
      </Secao>

      <Secao id="pagina-tabela-vazia" titulo="PaginaTabela · sem linhas" arquivo="EstadoVazio dentro do cartão">
        <PaginaTabela
          titulo="Campanhas"
          abas={["Campanhas", "Listas", "Modelos"]}
          colunas={[{ titulo: "Campanha" }, { titulo: "Enviados", largura: 120 }, { titulo: "Status", largura: 110 }]}
          linhas={[]}
        />
      </Secao>

      <Secao id="pagina-cards" titulo="PaginaCards · Configurações" arquivo="admin/pagina-cards.tsx">
        <PaginaCards titulo={config.titulo} subtitulo={config.subtitulo} acao={config.acao} cards={config.cards} />
      </Secao>

      <Secao id="kpi" titulo="CartaoKpi + SeletorPeriodo" arquivo="admin/cartao-kpi.tsx · seletor-periodo.tsx">
        <CabecalhoPagina variante="admin" titulo="Boa tarde, Valmer" descricao="O pulso da sua área de membros" acoes={<SeletorPeriodo />} />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
          {KPIS_DASHBOARD.map((k) => (
            <CartaoKpi key={k.rotulo} {...k} />
          ))}
        </div>
      </Secao>

      <Secao id="shell" titulo="ShellAdmin" arquivo="admin/shell-admin.tsx · sidebar-admin.tsx · navegacao.ts">
        {/* transform cria um novo bloco de contenção: a sidebar sticky rola dentro do quadro. */}
        <div className="h-[640px] w-full overflow-auto rounded-2xl border border-border transform-[translateZ(0)]">
          <ShellAdmin usuario={{ nome: "Valmer Albuquerque", papel: "DONO" }}>
            <CabecalhoPagina variante="admin" titulo="Conteúdo da página" descricao="Padding 44/40 no desktop, 24/20 no celular." />
          </ShellAdmin>
        </div>
      </Secao>
    </main>
  );
}
