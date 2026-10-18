import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { produtosParaMatricular } from "@/lib/matriculas/consultas";
import { listarVouchers, resgatesDoVoucher } from "@/lib/vouchers/consultas";
import { ABAS_MEMBROS } from "../../_components/comum";

export const metadata: Metadata = { title: "Resgates do voucher" };

const COLUNAS: Coluna[] = [
  { titulo: "Membro" },
  { titulo: "Cursos liberados" },
  { titulo: "Resgatado em", largura: 150 },
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const quando = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

type Props = { params: Promise<{ voucherId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function Resgates({ params, searchParams }: Props) {
  const { criador } = await membroDaPagina(EQUIPE);
  const { voucherId } = await params;
  const q = (await searchParams).q;
  const busca = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 80).toLowerCase() || undefined;
  if (!UUID.test(voucherId)) notFound();
  const [todos, vouchers, produtos] = await Promise.all([resgatesDoVoucher(criador.id, voucherId), listarVouchers(criador.id), produtosParaMatricular(criador.id)]);
  const voucher = vouchers.find((v) => v.id === voucherId);
  if (!todos || !voucher) notFound();
  const resgates = busca ? todos.filter((r) => `${r.nome} ${r.email}`.toLowerCase().includes(busca)) : todos;
  const titulo = new Map(produtos.map((p) => [p.id, p.titulo]));

  const linhas: Linha[] = resgates.map((r) => {
    const novas = r.matriculas.filter((m) => m.resultado !== "ja-existia");
    const cursos = novas.map((m) => titulo.get(m.produtoId) ?? "Curso removido");
    const jaTinha = r.matriculas.length - novas.length;
    return [
      { tipo: "membro", nome: r.nome, email: r.email },
      {
        tipo: "texto",
        texto: cursos.length ? cursos.join(", ") : "Nenhum curso novo",
        sub: jaTinha ? `${jaTinha} ${jaTinha === 1 ? "curso já liberado antes" : "cursos já liberados antes"}` : undefined,
      },
      { tipo: "data", texto: quando(r.resgatadoEm) },
    ];
  });
  const codigo = voucher.codigo;
  return (
    <PaginaTabela
      titulo={`Resgates · ${codigo}`}
      estatistica={`${todos.length} ${todos.length === 1 ? "resgate" : "resgates"}${voucher.limiteUsos !== null ? ` de ${voucher.limiteUsos}` : ""}${voucher.descricao ? ` · ${voucher.descricao}` : ""}`}
      abas={ABAS_MEMBROS}
      abaAtiva="Vouchers"
      busca="Pesquise por nome ou e-mail..."
      valorBusca={busca}
      formBusca={{ nome: "q" }}
      filtrosAtivos={busca ? [{ rotulo: `Busca · ${busca}`, hrefRemover: `/admin/membros/vouchers/${voucherId}` }] : []}
      acaoSecundaria={{ rotulo: "Voltar aos vouchers", icone: ArrowLeft, href: "/admin/membros/vouchers" }}
      colunas={COLUNAS}
      linhas={linhas}
      chaves={resgates.map((r) => r.id)}
      vazio={
        busca
          ? { titulo: "Nenhum resgate encontrado", descricao: "Ajuste a busca." }
          : { titulo: "Ninguém resgatou ainda", descricao: "Cada resgate aparece aqui com quem, quando e os cursos liberados." }
      }
    />
  );
}

/** Quem resgatou o voucher, quando e o que ganhou (DONO e ADMIN), RN-201. */
export default function PaginaResgates(props: Props) {
  return (
    <Suspense fallback={null}>
      <Resgates {...props} />
    </Suspense>
  );
}
