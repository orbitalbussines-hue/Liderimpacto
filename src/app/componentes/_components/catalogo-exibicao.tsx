import { ChevronRight, ClipboardList, Download, FileText, LayoutGrid, Plus, Settings, Users } from "lucide-react";
import { Logo } from "@/components/marca/logo";
import { Avatar } from "@/components/ui/avatar";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { Button } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { EspacoImagem } from "@/components/ui/espaco-imagem";
import { Estatistica } from "@/components/ui/estatistica";
import { IconeQuadrado } from "@/components/ui/icone-quadrado";
import { Amostra, Secao } from "./secao";

export function CatalogoProgressoAvatar() {
  return (
    <>
      <Secao id="progresso" titulo="Barra de progresso" arquivo="ui/barra-progresso.tsx">
        <div className="grid gap-6 desk:grid-cols-3">
          <Amostra rotulo="Padrão 5px + percentual" className="block">
            <BarraProgresso valor={42} rotulo="Progresso do curso" mostrarPercentual />
          </Amostra>
          <Amostra rotulo="6px (página do curso)" className="block">
            <div className="mb-2 flex justify-between text-[13px]">
              <span className="font-semibold">Seu progresso</span>
              <span className="text-muted">12 de 28 aulas</span>
            </div>
            <BarraProgresso valor={42} espessura={6} rotulo="Seu progresso" />
          </Amostra>
          <Amostra rotulo="Sobre imagem (base da capa)" className="block">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg">
              <EspacoImagem alt="" dica="Cultura organizacional do líder" />
              <BarraProgresso valor={64} variante="sobreImagem" rotulo="Assistido" />
            </div>
          </Amostra>
        </div>
      </Secao>

      <Secao id="avatar" titulo="Avatar" arquivo="ui/avatar.tsx">
        <Amostra rotulo="Tamanhos 28 · 30 · 32 · 36 · 40 · 56 · 96 e tons">
          <Avatar nome="Valmer Albuquerque" tamanho={28} tom="accent" />
          <Avatar nome="Ana Ribeiro" tamanho={30} />
          <Avatar nome="Carlos Mendes" tamanho={32} />
          <Avatar nome="Valmer Albuquerque" tamanho={36} forma="quadrado" tom="dourado" />
          <Avatar nome="Valmer Albuquerque" tamanho={40} tom="accent" />
          <Avatar nome="Valmer Albuquerque" tamanho={56} />
          <Avatar nome="Valmer Albuquerque" tamanho={96} tom="accent" borda />
        </Amostra>
      </Secao>
    </>
  );
}

export function CatalogoCartoes() {
  return (
    <Secao id="cartao" titulo="Cartão, ícone e estatística" arquivo="ui/cartao.tsx · icone-quadrado.tsx · estatistica.tsx">
      <div className="grid gap-4 desk:grid-cols-3">
        <Cartao className="flex items-start gap-3.5">
          <IconeQuadrado>
            <Users />
          </IconeQuadrado>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold">Grupos de acesso</div>
            <div className="mt-[3px] text-xs leading-normal text-muted">Quem vê cada produto e trilha.</div>
          </div>
          <ChevronRight className="size-4 text-muted" aria-hidden />
        </Cartao>
        <Cartao padding={18} className="flex flex-wrap items-center gap-4">
          <IconeQuadrado tamanho={44} tom="ok">
            <ClipboardList />
          </IconeQuadrado>
          <div className="min-w-[160px] flex-1">
            <div className="text-[15px] font-bold">Avaliação final</div>
            <div className="mt-0.5 text-xs text-muted">Líder de Impacto · 20 questões</div>
          </div>
        </Cartao>
        <Cartao padding={16} raio={14} className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface p-3 text-[13px] font-semibold">
            <IconeQuadrado tamanho={32}>PDF</IconeQuadrado>
            Material complementar · Aula 3.2
          </div>
          <div className="flex items-center gap-2.5 text-[13px] font-semibold">
            <IconeQuadrado tamanho={32} tom="neutro">
              <FileText />
            </IconeQuadrado>
            Exercício: mapa de cultura
          </div>
        </Cartao>
        <Cartao padding={24} raio={18} className="flex flex-col items-center gap-3.5 text-center">
          <Avatar nome="Valmer Albuquerque" tamanho={96} tom="accent" borda />
          <div>
            <div className="text-xl font-extrabold">Valmer Albuquerque</div>
            <div className="text-[13px] text-muted">Membro desde mai/2026</div>
          </div>
          <div className="mt-1.5 grid w-full grid-cols-3 gap-2">
            <Estatistica variante="compacta" valor="12" rotulo="aulas" />
            <Estatistica variante="compacta" valor="1" rotulo="certificado" />
            <Estatistica variante="compacta" valor="340" rotulo="pontos" tom="accent" />
          </div>
        </Cartao>
        <Cartao className="flex flex-col gap-3.5 desk:col-span-2">
          <CartaoTitulo tamanho={15}>Saúde dos produtos</CartaoTitulo>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2.5">
            <Estatistica valor="3" rotulo="Produtos ativos" />
            <Estatistica valor="39%" rotulo="Taxa de conclusão" />
            <Estatistica valor="4,8" rotulo="Avaliação média" />
          </div>
        </Cartao>
      </div>
    </Secao>
  );
}

export function CatalogoCabecalhos() {
  return (
    <Secao id="cabecalho" titulo="Cabeçalho de página" arquivo="ui/cabecalho-pagina.tsx">
      <div className="flex flex-col gap-8">
        <CabecalhoPagina como="h2" titulo="Continuar aprendendo" contador={2} />
        <CabecalhoPagina
          como="h2"
          titulo="Avaliações"
          descricao="Quizzes e provas dos seus cursos. A avaliação final libera o certificado."
        />
        <CabecalhoPagina
          como="h2"
          variante="curso"
          eyebrow="Formação executiva online"
          titulo="Líder de Impacto"
          descricao="Formação para líderes que influenciam, desenvolvem pessoas e geram resultados reais. 28 aulas em 6 módulos com Valmer Albuquerque."
        />
        <CabecalhoPagina como="h2" variante="aula" eyebrow="Módulo 3 · Aula 2" titulo="Cultura organizacional do líder" />
        <CabecalhoPagina
          como="h2"
          variante="admin"
          titulo="Boa tarde, Valmer"
          descricao="O pulso da sua área de membros"
          acoes={
            <Button size="36">
              <Plus aria-hidden />
              Nova página
            </Button>
          }
        />
        <Cartao padding={0}>
          <CabecalhoPagina
            como="h2"
            variante="adminTabela"
            className="items-center px-5 py-[18px]"
            titulo="Membros"
            meta={
              <>
                139 total · <b className="text-ok">137 ativos</b> · 2 inativos · 59 nunca acessaram
              </>
            }
            acoes={
              <>
                <Button variant="contorno" size="36">
                  <Download aria-hidden />
                  Exportar
                </Button>
                <Button size="36">
                  <Plus aria-hidden />
                  Cadastrar
                </Button>
              </>
            }
          />
        </Cartao>
      </div>
    </Secao>
  );
}

export function CatalogoImagemLogo() {
  return (
    <Secao id="imagem" titulo="Espaço de imagem e logo" arquivo="ui/espaco-imagem.tsx · marca/logo.tsx">
      <Amostra rotulo="Proporções 16/9 · 3/4 · 16/10 · 1.414 (sem src = vazio)" className="items-start">
        <div className="w-[280px]">
          <EspacoImagem proporcao="16/9" alt="Capa da aula" dica="Liderança situacional" className="rounded-lg" />
        </div>
        <div className="w-[128px]">
          <EspacoImagem proporcao="3/4" alt="Capa do curso" dica="Capa do curso" className="rounded-lg" />
        </div>
        <div className="w-[220px]">
          <EspacoImagem proporcao="16/10" alt="Capa" dica="Capa 16:10" className="rounded-2xl" />
        </div>
        <div className="w-[220px]">
          <EspacoImagem proporcao="1.414" alt="Prévia do certificado" dica="Certificado" className="rounded-lg" />
        </div>
      </Amostra>
      <Amostra rotulo="Logo provisório (texto, sem monograma)">
        <Logo />
        <Logo variante="bloco" />
        <Logo variante="bloco" tamanho={10} />
        <span className="flex items-center gap-2">
          <IconeQuadrado tamanho={32}>
            <LayoutGrid />
          </IconeQuadrado>
          <IconeQuadrado tamanho={32} tom="neutro">
            <Settings />
          </IconeQuadrado>
        </span>
      </Amostra>
      <Amostra rotulo="Logo fixo (fundo sempre escuro)" escura>
        <Logo variante="fixo" />
      </Amostra>
    </Secao>
  );
}
