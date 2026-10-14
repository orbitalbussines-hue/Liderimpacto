import { Abas } from "@/components/ui/abas";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { ROTULO_TIPO_AVALIACAO } from "@/lib/avaliacoes/regras";
import type { StatusAvaliacao, TipoAvaliacao } from "@/lib/db/schema/_enums";
import { ROTULO_STATUS_AVALIACAO } from "../../_components/comum";

export interface CabecalhoAvaliacaoProps {
  avaliacao: { id: string; titulo: string; tipo: TipoAvaliacao; status: StatusAvaliacao; curso: string; modulo: string | null };
  ativa: "Questões e regras" | "Alunos";
}

/** Topo comum do editor e da aba Alunos: tipo · curso, título, situação e as abas (links). */
export function CabecalhoAvaliacao({ avaliacao, ativa }: CabecalhoAvaliacaoProps) {
  const base = `/admin/avaliacoes/${avaliacao.id}`;
  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina
        variante="admin"
        eyebrow={`${ROTULO_TIPO_AVALIACAO[avaliacao.tipo]} · ${avaliacao.curso}`}
        titulo={avaliacao.titulo}
        descricao={`${ROTULO_STATUS_AVALIACAO[avaliacao.status]} · ${avaliacao.modulo ?? "Avaliação do curso"}`}
      />
      <Abas
        tamanho="admin"
        aria-label="Seções da avaliação"
        ativo={ativa}
        itens={[
          { valor: "Questões e regras", rotulo: "Questões e regras", href: base },
          { valor: "Alunos", rotulo: "Alunos", href: `${base}/alunos` },
        ]}
      />
    </div>
  );
}
