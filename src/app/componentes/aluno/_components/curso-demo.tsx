import { Award, FileText, MessageCircle, Smartphone, Users, Video } from "lucide-react";
import { AcordeaoModulos } from "@/components/curso/acordeao-modulos";
import { AnexoMaterial } from "@/components/curso/anexo-material";
import { CartaoInclui } from "@/components/curso/cartao-inclui";
import { CartaoProfessor } from "@/components/curso/cartao-professor";
import { FaixaCapitulos } from "@/components/curso/faixa-capitulos";
import { ListaAulas } from "@/components/curso/lista-aulas";
import { ProgressoCurso } from "@/components/curso/progresso-curso";
import { EstiloMarca } from "@/components/marca/estilo-marca";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { EspacoImagem } from "@/components/ui/espaco-imagem";
import { Secao } from "../../_components/secao";
import { CAPITULOS, GRUPOS_PLAYLIST, MODULOS } from "../dados";

const INCLUI = [
  { icone: <Video />, rotulo: "28 aulas em vídeo · 9h 25" },
  { icone: <FileText />, rotulo: "Materiais em PDF e exercícios" },
  { icone: <Users />, rotulo: "Mentorias em grupo ao vivo" },
  { icone: <Award />, rotulo: "Certificado de conclusão" },
  { icone: <Smartphone />, rotulo: "Acesso por computador, celular ou tablet" },
  { icone: <MessageCircle />, rotulo: "Fórum de dúvidas" },
];

/** Página do curso + playlist/materiais do player, com a cor própria do curso (criador -> curso). */
export function CursoDemo() {
  return (
    <Secao id="curso" titulo="Página do curso e player" arquivo="curso/*">
      <EstiloMarca cor="#1F6FEB" escopo="curso-demo" />
      <div data-marca="curso-demo" className="flex flex-col gap-8 rounded-2xl border border-border p-5 desk:p-8">
        <p className="m-0 text-xs font-bold tracking-[.1em] text-accent uppercase">Cor própria do curso</p>
        <div className="grid items-start gap-8 desk:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-7">
            <CabecalhoPagina
              variante="curso"
              eyebrow="Formação executiva online"
              titulo="Líder de Impacto"
              descricao="Formação para líderes que influenciam, desenvolvem pessoas e geram resultados reais. 28 aulas em 6 módulos com Valmer Albuquerque."
            />
            <ProgressoCurso aulasConcluidas={12} totalAulas={28} href="#" textoBotao="Continuar · Aula 3.2" />
            <div>
              <h2 className="m-0 mb-3.5 font-sans text-lg font-extrabold tracking-normal">Conteúdo do curso</h2>
              <AcordeaoModulos modulos={MODULOS} />
            </div>
          </div>
          <aside className="flex flex-col gap-4">
            <EspacoImagem proporcao="3/4" alt="" dica="Capa do curso" className="rounded-2xl" />
            <CartaoInclui itens={INCLUI} />
            <CartaoProfessor nome="Valmer Albuquerque" />
          </aside>
        </div>

        <div className="grid items-start gap-6 desk:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            <CabecalhoPagina variante="aula" eyebrow="Módulo 3 · Aula 2" titulo="Cultura organizacional do líder" />
            <FaixaCapitulos capitulos={CAPITULOS} />
            <div className="flex flex-wrap gap-2.5">
              <AnexoMaterial tipo="PDF" nome="Material complementar · Aula 3.2" />
              <AnexoMaterial tipo="DOC" nome="Exercício: mapa de cultura" />
            </div>
          </div>
          <ListaAulas tituloCurso="Líder de Impacto" aulasConcluidas={12} totalAulas={28} grupos={GRUPOS_PLAYLIST} />
        </div>
      </div>
    </Secao>
  );
}
