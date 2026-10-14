import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { EstadoVazio } from "@/components/ui/estado-vazio";

export default function Inicio() {
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
      <CabecalhoPagina titulo="Início" />
      <EstadoVazio comMoldura titulo="Esta área está em construção" descricao="A vitrine chega nos próximos passos." />
    </div>
  );
}
