import { ShellAluno } from "@/components/aluno/shell-aluno";
import { CartaoCurso } from "@/components/curso/cartao-curso";
import { Abas } from "@/components/ui/abas";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Destaque } from "@/components/vitrine/destaque";
import { Fileira } from "@/components/vitrine/fileira";
import { varianteDoTipo } from "@/components/vitrine/tipos";
import { Secao } from "../../_components/secao";
import { CURSOS_CONTINUAR, DESTAQUE, FILEIRAS } from "../dados";

/** Shell + Destaque + 6 fileiras padrão, dentro de um quadro rolável. */
export function VitrineDemo() {
  return (
    <>
      <Secao id="vitrine" titulo="Shell e vitrine" arquivo="aluno/shell-aluno.tsx · vitrine/*">
        <div className="max-h-[900px] overflow-y-auto rounded-2xl border border-border">
          <ShellAluno usuario={{ nome: "Valmer Albuquerque", iniciais: "VA" }} notificacoes={3}>
            <div className="mx-auto flex max-w-[1600px] flex-col gap-[22px] desk:gap-[34px]">
              <Destaque {...DESTAQUE} mostrarSom />
              {FILEIRAS.map((f) => (
                <Fileira key={f.id} titulo={f.titulo} tag={f.tag} variante={varianteDoTipo(f.tipo)} itens={f.itens} />
              ))}
              <Fileira titulo="Fileira vazia (não aparece)" itens={[]} />
            </div>
          </ShellAluno>
        </div>
      </Secao>

      <Secao id="continuar" titulo="Continuar" arquivo="curso/cartao-curso.tsx">
        <div className="flex flex-col gap-5">
          <CabecalhoPagina titulo="Continuar aprendendo" contador={CURSOS_CONTINUAR.length} />
          <Abas
            aria-label="Filtro de conteúdo"
            itens={["Conteúdos", "Favoritos", "Anotações", "Turmas"].map((r) => ({ valor: r, rotulo: r }))}
          />
          <div className="grid gap-[18px] md:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
            {CURSOS_CONTINUAR.map((c) => (
              <CartaoCurso
                key={c.id}
                titulo={c.titulo}
                progresso={c.progresso}
                aulasConcluidas={c.feitas}
                totalAulas={c.total}
                href="#"
              />
            ))}
          </div>
        </div>
      </Secao>
    </>
  );
}
