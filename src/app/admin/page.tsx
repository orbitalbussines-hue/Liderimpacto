import { Suspense } from "react";
import { CartaoKpi } from "@/components/admin/cartao-kpi";
import { saudacaoPorHorario } from "@/components/admin/saudacao";
import { SeletorPeriodo } from "@/components/admin/seletor-periodo";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { BarChart3 } from "lucide-react";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";

/** Sessao e hora mudam a cada request: fora do prerender (cacheComponents), atras do Suspense. */
async function Saudacao() {
  const { usuario } = await membroDaPagina(EQUIPE);
  return `${saudacaoPorHorario(new Date())}, ${usuario.nome.split(/\s+/)[0]}`;
}

const KPIS = ["Receita", "Novos alunos", "Acessos de alunos", "Matrículas"] as const;

export default function HomeAdmin() {
  return (
    <>
      <CabecalhoPagina
        variante="admin"
        titulo={
          <Suspense fallback="Olá">
            <Saudacao />
          </Suspense>
        }
        descricao="O pulso da sua área de membros"
        acoes={<SeletorPeriodo />}
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        {KPIS.map((rotulo) => (
          <CartaoKpi key={rotulo} rotulo={rotulo} valor="—" />
        ))}
      </div>
      <EstadoVazio
        comMoldura
        icone={<BarChart3 />}
        titulo="Os indicadores aparecem quando houver alunos e matrículas"
        descricao="Acessos, conclusão e aulas mais assistidas ganham gráficos assim que os primeiros alunos entrarem."
      />
    </>
  );
}
