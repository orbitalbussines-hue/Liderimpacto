import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Play } from "lucide-react";
import { Logo } from "@/components/marca/logo";
import { AlternarTema } from "@/components/ui/alternar-tema";
import { Abas } from "@/components/ui/abas";
import { Avatar } from "@/components/ui/avatar";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { Button, buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { Interruptor } from "@/components/ui/interruptor";
import { Selo } from "@/components/ui/selo";
import { CatalogoBotoes, CatalogoSelos } from "./_components/catalogo-acoes";
import {
  CatalogoCabecalhos,
  CatalogoCartoes,
  CatalogoImagemLogo,
  CatalogoProgressoAvatar,
} from "./_components/catalogo-exibicao";
import { CatalogoEstados } from "./_components/catalogo-estados";
import { CatalogoFiltros, CatalogoFormularios } from "./_components/catalogo-formularios";
import { CatalogoNavegacao } from "./_components/catalogo-navegacao";
import { CorDaMarca } from "./_components/cor-da-marca";
import { Secao } from "./_components/secao";

export const metadata: Metadata = { title: "Componentes", robots: { index: false } };

/**
 * Catalogo vivo do design system: a referencia visual para montar tela nova.
 * So existe em desenvolvimento. NODE_ENV e embutido no build, entao em producao
 * a rota e pre-renderizada como 404 (notFound no render, sem dado dinamico).
 */
export default function CatalogoComponentes() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-14 px-5 py-6 desk:px-10 desk:py-11">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <Logo />
          <AlternarTema />
        </div>
        <CabecalhoPagina
          eyebrow="Design system"
          titulo="Componentes"
          descricao="Tela nova = montar com estas peças. Falta algo? Crie a primitiva em src/components/ui, nunca estilo solto na tela."
          acoes={
            <>
              <Link href="/componentes/aluno" className={buttonVariants({ variant: "contorno", size: "40" })}>
                Compostos do aluno
              </Link>
              <Link href="/componentes/admin" className={buttonVariants({ variant: "contorno", size: "40" })}>
                Compostos do admin
              </Link>
            </>
          }
        />
      </div>

      <CatalogoBotoes />
      <CatalogoSelos />
      <CatalogoFormularios />
      <CatalogoFiltros />
      <CatalogoNavegacao />
      <CatalogoProgressoAvatar />
      <CatalogoCartoes />
      <CatalogoCabecalhos />
      <CatalogoImagemLogo />
      <CatalogoEstados />

      <Secao id="marca" titulo="Cor da marca" arquivo="lib/marca/paleta.ts · marca/estilo-marca.tsx">
        <CorDaMarca>
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <Logo />
              <Button>Salvar alterações</Button>
              <Button variant="contorno">Ver como aluno</Button>
              <Button variant="link">Criar minha senha</Button>
              <Selo tom="accent">Disponível</Selo>
              <Selo tom="solido" forma="etiqueta">
                Novo
              </Selo>
              <Avatar nome="Valmer Albuquerque" tamanho={36} forma="quadrado" tom="dourado" />
              <Interruptor aria-label="Exemplo ligado" ligadoInicial />
            </div>
            <div className="grid gap-4 desk:grid-cols-2">
              <Abas aria-label="Exemplo" itens={[{ valor: "a", rotulo: "Descrição" }, { valor: "b", rotulo: "Materiais" }]} />
              <BarraProgresso valor={58} mostrarPercentual rotulo="Exemplo de progresso" />
            </div>
            <GrupoChips
              aria-label="Exemplo de chips"
              valorInicial="Top 10"
              opcoes={[
                { valor: "Novidades", rotulo: "Novidades" },
                { valor: "Top 10", rotulo: "Top 10" },
              ]}
            />
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-fixo-bg p-5">
              <Button variant="heroPrimario" size="48">
                <Play aria-hidden className="fill-current" />
                Assistir
              </Button>
              <Button variant="heroSecundario" size="48">
                Mais informações
              </Button>
              <Selo tom="fixo" forma="etiqueta" className="text-xs">
                28 aulas
              </Selo>
            </div>
          </div>
        </CorDaMarca>
      </Secao>
    </main>
  );
}
