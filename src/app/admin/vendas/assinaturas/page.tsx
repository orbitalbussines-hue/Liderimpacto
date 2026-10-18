import type { Metadata } from "next";
import { Suspense } from "react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import { SITUACOES_ASSINATURA } from "@/lib/db/schema/_enums";
import { listarAssinaturas } from "@/lib/pagamentos/consultas";
import { formatarCentavos } from "@/lib/pagamentos/regras";
import { dataCurta } from "../../membros/_components/comum";
import { CarregandoLista } from "../../matriculas/_components/carregando";
import { lerPagina, linkCom, um, type Busca } from "../../matriculas/_components/comum";
import { MenusFiltro } from "../../matriculas/_components/menus-filtro";
import { ABAS_VENDAS } from "../_components/abas";
import { ROTULO_SITUACAO_ASSINATURA, TOM_SITUACAO_ASSINATURA } from "../_components/comum";

export const metadata: Metadata = { title: "Assinaturas" };

const BASE = "/admin/vendas/assinaturas";
const POR_PAGINA = 25;
const COLUNAS: Coluna[] = [
  { titulo: "Assinante" },
  { titulo: "Oferta", largura: 200 },
  { titulo: "Situação", largura: 170 },
  { titulo: "Próxima cobrança / fim", largura: 170 },
  { titulo: "Total pago", largura: 130, alinhar: "direita" },
  { titulo: "Desde", largura: 110 },
];
const INTERVALO = { MES: "Mensal", ANO: "Anual" } as const;

type LinhaAssinatura = Awaited<ReturnType<typeof listarAssinaturas>>["linhas"][number];

/** "Próxima cobrança 12/11/26" · "Termina em 12/11/26" · "Encerrada em 02/10/26". */
function periodo(a: LinhaAssinatura): { texto: string; sub?: string } {
  if (a.situacao === "CANCELADA") return { texto: a.encerradaEm ? dataCurta(a.encerradaEm) : "—", sub: "Encerrada" };
  if (!a.periodoFim) return { texto: "—" };
  if (a.cancelarNoFim) return { texto: dataCurta(a.periodoFim), sub: "Termina (não renova)" };
  return { texto: dataCurta(a.periodoFim), sub: a.situacao === "ATRASADA" ? "Cobrança em nova tentativa" : "Próxima cobrança" };
}

async function Assinaturas({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(["DONO"]);
  const sp = await searchParams;
  const situacao = SITUACOES_ASSINATURA.find((s) => s.toLowerCase() === um(sp.situacao));
  const atual = { situacao: situacao?.toLowerCase() };
  const pagina = lerPagina(sp.pagina);
  const lista = await listarAssinaturas(criador.id, { situacao, pagina, porPagina: POR_PAGINA });
  const href = (mudar: Record<string, string | undefined>) => linkCom(BASE, atual, mudar);

  const linhas: Linha[] = lista.linhas.map((a) => {
    const p = periodo(a);
    return [
      { tipo: "membro", nome: a.nome, email: a.email },
      { tipo: "texto", texto: a.oferta, sub: a.intervalo ? INTERVALO[a.intervalo] : undefined },
      {
        tipo: "no",
        conteudo: (
          <div className="flex flex-col items-start gap-0.5">
            <Selo tom={TOM_SITUACAO_ASSINATURA[a.situacao]}>{ROTULO_SITUACAO_ASSINATURA[a.situacao]}</Selo>
            {a.cancelarNoFim && a.situacao !== "CANCELADA" && <span className="text-xs text-muted">Cancela no fim do período</span>}
          </div>
        ),
      },
      { tipo: "texto", texto: p.texto, sub: p.sub },
      { tipo: "texto", texto: formatarCentavos(a.pagoCentavos) },
      { tipo: "data", texto: dataCurta(a.criadaEm) },
    ];
  });

  return (
    <PaginaTabela
      titulo="Assinaturas"
      estatistica={`${lista.total} ${lista.total === 1 ? "assinatura" : "assinaturas"}${situacao ? " no filtro" : ""} · cobradas pelo Stripe; o acesso vale até o fim do período pago mais 3 dias`}
      abas={ABAS_VENDAS}
      abaAtiva="Assinaturas"
      semBusca
      filtrosAtivos={situacao ? [{ rotulo: `Situação · ${ROTULO_SITUACAO_ASSINATURA[situacao]}`, hrefRemover: href({ situacao: undefined }) }] : []}
      controles={
        <MenusFiltro
          menus={[
            {
              rotulo: "Situação",
              itens: SITUACOES_ASSINATURA.map((s) => ({ rotulo: ROTULO_SITUACAO_ASSINATURA[s], href: href({ situacao: s.toLowerCase() }), marcado: situacao === s })),
            },
          ]}
        />
      }
      colunas={COLUNAS}
      linhas={linhas}
      chaves={lista.linhas.map((a) => a.id)}
      paginacao={{ pagina, porPagina: POR_PAGINA, total: lista.total, href: (n) => href({ pagina: String(n) }) }}
      vazio={
        situacao
          ? { titulo: "Nenhuma assinatura nesta situação", descricao: "Remova o filtro para ver todas." }
          : { titulo: "Nenhuma assinatura ainda", descricao: "Quando alguém assinar uma oferta mensal ou anual, a assinatura aparece aqui." }
      }
    />
  );
}

/** Assinaturas do criador do HOST (só DONO, RN-217). */
export default function PaginaAssinaturas({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={<CarregandoLista />}>
      <Assinaturas searchParams={searchParams} />
    </Suspense>
  );
}
