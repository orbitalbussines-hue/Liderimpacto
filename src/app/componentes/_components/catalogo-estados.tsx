import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Esqueleto } from "@/components/ui/esqueleto";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { DemoEstadoErro, DemoFiltroAtivo, DemoModal } from "./demos";
import { Amostra, Secao } from "./secao";

export function CatalogoEstados() {
  return (
    <Secao id="estados" titulo="Estados (derivados)" arquivo="ui/estado-vazio.tsx · esqueleto.tsx · estado-erro.tsx">
      <div className="grid gap-4 desk:grid-cols-3">
        <EstadoVazio
          comMoldura
          icone={<BookOpen />}
          titulo="Nenhum curso em andamento"
          descricao="Quando você começar uma aula, ela aparece aqui para continuar de onde parou."
          acao={<Button size="40">Explorar cursos</Button>}
        />
        <div aria-busy className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <span className="sr-only">Carregando...</span>
          <Esqueleto className="aspect-video w-full rounded-lg" />
          <Esqueleto className="h-3.5 w-3/4" />
          <Esqueleto className="h-3 w-1/2" />
          <Esqueleto className="h-[5px] w-full rounded-full" />
        </div>
        <DemoEstadoErro />
      </div>
      <Amostra rotulo="Modal de ação crítica (3 s travado, sem ESC/clique fora) e filtro removível">
        <DemoModal />
        <DemoFiltroAtivo />
      </Amostra>
    </Secao>
  );
}
