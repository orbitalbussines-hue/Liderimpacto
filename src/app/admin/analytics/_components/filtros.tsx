import { Download } from "lucide-react";
import { SeletorDatas } from "@/components/admin/seletor-datas";
import { Abas } from "@/components/ui/abas";
import { Button, buttonVariants } from "@/components/ui/button";
import { Selecao } from "@/components/ui/selecao";
import { ABAS_ANALYTICS, consulta } from "@/lib/analytics/regras";
import { contextoAnalytics, type ParametrosAnalytics } from "./contexto";

const CAMINHO = "/admin/analytics";

/**
 * Abas (links), filtro de curso (form GET: funciona sem JS), período `?de=&ate=` (só nas abas que o
 * usam: Conteúdo é a situação de hoje e Retenção são sempre 8 semanas) e o CSV da aba atual.
 */
export async function FiltrosAnalytics({ parametros }: { parametros: ParametrosAnalytics }) {
  const { filtros, cursos, hoje } = await contextoAnalytics(parametros);
  const { aba, periodo, curso, ordem } = filtros;
  const usaPeriodo = aba === "visao-geral" || aba === "avaliacoes";
  return (
    <div className="flex flex-col gap-3.5">
      <Abas
        tamanho="admin"
        aria-label="Seções do Analytics"
        ativo={aba}
        itens={ABAS_ANALYTICS.map((a) => ({ valor: a.valor, rotulo: a.rotulo, href: `${CAMINHO}?${consulta({ aba: a.valor, periodo, curso })}` }))}
      />
      <div className="flex flex-wrap items-end gap-2.5">
        <form method="get" action={CAMINHO} className="flex min-w-0 flex-[1_1_260px] items-end gap-2">
          {aba !== "visao-geral" && <input type="hidden" name="aba" value={aba} />}
          <input type="hidden" name="de" value={periodo.de} />
          <input type="hidden" name="ate" value={periodo.ate} />
          {ordem === "estrutura" && <input type="hidden" name="ordem" value="estrutura" />}
          <Selecao
            name="curso"
            rotulo="Curso"
            rotuloOculto
            tamanho="36"
            fundo="surface"
            vazio="Todos os cursos"
            defaultValue={curso ?? ""}
            opcoes={cursos.map((c) => ({ valor: c.id, rotulo: c.titulo }))}
            classNameMoldura="min-w-0 flex-1"
          />
          <Button type="submit" variant="secundario" size="36">
            Filtrar
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-2.5">
          {usaPeriodo && (
            <SeletorDatas valor={periodo} hoje={hoje} caminho={CAMINHO} manter={{ aba: aba === "visao-geral" ? null : aba, curso, ordem: ordem === "estrutura" ? ordem : null }} />
          )}
          <a href={`${CAMINHO}/exportar?${consulta(filtros)}`} download className={buttonVariants({ variant: "contorno", size: "36" })}>
            <Download className="size-3.5" aria-hidden />
            Exportar CSV
          </a>
        </div>
      </div>
    </div>
  );
}
