import type { Metadata } from "next";
import { Suspense } from "react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha, TomSelo } from "@/components/admin/tabela-tipos";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { SITUACOES_VOUCHER, type SituacaoVoucher } from "@/lib/db/schema/_enums";
import { produtosParaMatricular } from "@/lib/matriculas/consultas";
import { listarVouchers } from "@/lib/vouchers/consultas";
import { ABAS_MEMBROS, dataCurta } from "../_components/comum";
import { FiltrosMembros } from "../_components/filtros-membros";
import { AcoesVoucher } from "./acoes-voucher";
import { camposDoVoucher } from "./campos";
import { CopiarCodigo } from "./copiar-codigo";
import { NovoVoucher } from "./form-voucher";

export const metadata: Metadata = { title: "Vouchers" };

const COLUNAS: Coluna[] = [
  { titulo: "Código" },
  { titulo: "Cursos", largura: 200 },
  { titulo: "Usos", largura: 90 },
  { titulo: "Válido até", largura: 110 },
  { titulo: "Acesso", largura: 120 },
  { titulo: "Situação", largura: 120 },
  { titulo: "Ações", largura: 56 },
];
const ROTULO_SITUACAO: Record<SituacaoVoucher, string> = { ATIVO: "Ativo", PAUSADO: "Pausado", ENCERRADO: "Encerrado" };

type Busca = Promise<Record<string, string | string[] | undefined>>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/** O que a linha mostra: a situação gravada, ou "Expirado"/"Esgotado" quando o voucher ativo já não resgata. */
function seloDaSituacao(v: { situacao: SituacaoVoucher; expirado: boolean; usos: number; limiteUsos: number | null }): { texto: string; tom: TomSelo } {
  if (v.situacao === "ENCERRADO") return { texto: "Encerrado", tom: "neutro" };
  if (v.expirado) return { texto: "Expirado", tom: "warn" };
  if (v.limiteUsos !== null && v.usos >= v.limiteUsos) return { texto: "Esgotado", tom: "warn" };
  return v.situacao === "ATIVO" ? { texto: "Ativo", tom: "ok" } : { texto: "Pausado", tom: "neutro" };
}

async function Vouchers({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  // searchParams são entrada do usuário: só passa o que tem formato conhecido.
  const filtros = { busca: um(sp.q)?.slice(0, 40), situacao: SITUACOES_VOUCHER.find((s) => s === um(sp.situacao)) };
  const filtrando = !!(filtros.busca || filtros.situacao);
  const [todos, filtrados, produtos] = await Promise.all([
    listarVouchers(criador.id),
    filtrando ? listarVouchers(criador.id, filtros) : null,
    produtosParaMatricular(criador.id),
  ]);
  const vouchers = filtrados ?? todos;
  const produtosForm = produtos.map((p) => ({ id: p.id, titulo: p.titulo, status: p.status }));

  const href = (mudar: Partial<Record<"q" | "situacao", string | undefined>>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: filtros.busca, situacao: filtros.situacao, ...mudar })) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/admin/membros/vouchers?${qs}` : "/admin/membros/vouchers";
  };
  const filtrosAtivos = [
    filtros.situacao && { rotulo: `Situação · ${ROTULO_SITUACAO[filtros.situacao]}`, hrefRemover: href({ situacao: undefined }) },
    filtros.busca && { rotulo: `Busca · ${filtros.busca}`, hrefRemover: href({ q: undefined }) },
  ].filter((f) => !!f);

  const linhas: Linha[] = vouchers.map((v) => [
    {
      tipo: "no",
      conteudo: (
        <div className="min-w-0">
          <CopiarCodigo codigo={v.codigo} />
          {v.descricao && <div className="truncate text-xs text-muted">{v.descricao}</div>}
        </div>
      ),
    },
    v.produtos.length
      ? { tipo: "etiqueta", texto: v.produtos.length > 1 ? `${v.produtos[0].titulo} +${v.produtos.length - 1}` : v.produtos[0].titulo }
      : { tipo: "texto", texto: "—" },
    { tipo: "texto", texto: v.limiteUsos === null ? String(v.usos) : `${v.usos} / ${v.limiteUsos}` },
    { tipo: "data", texto: v.validoAte ? dataCurta(v.validoAte) : "Sem prazo" },
    { tipo: "texto", texto: v.diasAcesso === null ? "Sem expiração" : `${v.diasAcesso} ${v.diasAcesso === 1 ? "dia" : "dias"}` },
    { tipo: "selo", ...seloDaSituacao(v) },
    {
      tipo: "no",
      conteudo: (
        <AcoesVoucher
          voucher={{
            id: v.id,
            codigo: v.codigo,
            situacao: v.situacao,
            usos: v.usos,
            versao: v.versao.toISOString(),
            campos: camposDoVoucher({ ...v, produtoIds: v.produtos.map((p) => p.id) }),
          }}
          produtos={produtosForm}
        />
      ),
    },
  ]);

  const ativos = todos.filter((v) => seloDaSituacao(v).texto === "Ativo").length;
  const resgates = todos.reduce((s, v) => s + v.usos, 0);
  return (
    <PaginaTabela
      titulo="Membros"
      estatistica={
        <>
          {todos.length} {todos.length === 1 ? "voucher" : "vouchers"} · <b className="text-ok">{ativos} valendo</b> · {resgates} {resgates === 1 ? "resgate" : "resgates"}
        </>
      }
      abas={ABAS_MEMBROS}
      abaAtiva="Vouchers"
      busca="Pesquise pelo código ou descrição..."
      valorBusca={filtros.busca}
      formBusca={{ nome: "q", manter: filtros.situacao ? { situacao: filtros.situacao } : {} }}
      filtrosAtivos={filtrosAtivos}
      controles={
        <FiltrosMembros
          menus={[{ rotulo: "Situação", itens: SITUACOES_VOUCHER.map((s) => ({ rotulo: ROTULO_SITUACAO[s], href: href({ situacao: s }), marcado: filtros.situacao === s })) }]}
        />
      }
      acoes={<NovoVoucher produtos={produtosForm} />}
      colunas={COLUNAS}
      linhas={linhas}
      chaves={vouchers.map((v) => v.id)}
      vazio={
        filtrando
          ? { titulo: "Nenhum voucher encontrado", descricao: "Ajuste a busca ou remova os filtros." }
          : { titulo: "Nenhum voucher ainda", descricao: "Um voucher é um código que dá matrícula em um ou mais cursos, com validade e limite de usos opcionais." }
      }
    />
  );
}

/** Vouchers do criador do HOST (DONO e ADMIN), RN-201. Busca e situação na URL. */
export default function PaginaVouchers({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Vouchers searchParams={searchParams} />
    </Suspense>
  );
}
