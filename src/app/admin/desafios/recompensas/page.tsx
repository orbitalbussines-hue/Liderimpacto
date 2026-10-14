import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { SegmentosLink } from "@/components/ui/segmentos-link";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { recompensasDoAdmin } from "@/lib/gamificacao/admin";
import { dataCurta } from "../../membros/_components/comum";
import { ABAS_DESAFIOS } from "../_components/comum";
import { MarcarEntregue } from "./marcar-entregue";

export const metadata: Metadata = { title: "Recompensas" };

const COLUNAS: Coluna[] = [
  { titulo: "Aluno" },
  { titulo: "Desafio e recompensa" },
  { titulo: "Concluiu em", largura: 110 },
  { titulo: "Entrega", largura: 220 },
];

type Busca = Promise<Record<string, string | string[] | undefined>>;

/** Quem concluiu desafio com recompensa (RN-147): pendentes primeiro; a equipe marca a entrega. */
async function Recompensas({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  const verEntregues = sp.situacao === "entregues";
  const todas = await recompensasDoAdmin(criador.id);
  const pendentes = todas.filter((r) => !r.entregueEm);
  const lista = verEntregues ? todas.filter((r) => r.entregueEm) : pendentes;

  const linhas: Linha[] = lista.map((r) => [
    { tipo: "membro", nome: r.nome, email: r.email, src: r.imagem },
    {
      tipo: "no",
      conteudo: (
        <span className="block min-w-0">
          <span className="block truncate font-semibold">{r.recompensa}</span>
          <Link href={`/admin/desafios/${r.desafioId}`} className="block truncate text-xs text-muted hover:underline">
            {r.desafio}
          </Link>
        </span>
      ),
    },
    { tipo: "data", texto: dataCurta(r.concluidoEm) },
    {
      tipo: "no",
      conteudo: r.entregueEm ? (
        <span className="block text-xs text-muted">
          Entregue em {dataCurta(r.entregueEm)}
          {r.entreguePor && <span className="block truncate">por {r.entreguePor}</span>}
        </span>
      ) : (
        <MarcarEntregue participacaoId={r.participacaoId} versao={r.versao.toISOString()} nome={r.nome} recompensa={r.recompensa} desafio={r.desafio} />
      ),
    },
  ]);

  return (
    <PaginaTabela
      titulo="Desafios"
      estatistica={
        <>
          Recompensas · <b className={pendentes.length ? "text-accent" : "text-ok"}>{pendentes.length === 1 ? "1 a entregar" : `${pendentes.length} a entregar`}</b> · {todas.length - pendentes.length} entregues
        </>
      }
      abas={ABAS_DESAFIOS}
      abaAtiva="Recompensas"
      semBusca
      controles={
        <SegmentosLink
          aria-label="Situação da entrega"
          opcoes={[
            { rotulo: "A entregar", href: "/admin/desafios/recompensas", ativo: !verEntregues },
            { rotulo: "Entregues", href: "/admin/desafios/recompensas?situacao=entregues", ativo: verEntregues },
          ]}
        />
      }
      colunas={COLUNAS}
      linhas={linhas}
      chaves={lista.map((r) => r.participacaoId)}
      vazio={
        verEntregues
          ? { titulo: "Nenhuma recompensa entregue ainda" }
          : { titulo: "Nada a entregar", descricao: "Quando um aluno concluir um desafio com recompensa, ele aparece aqui até a equipe marcar a entrega." }
      }
    />
  );
}

export default function PaginaRecompensas({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Recompensas searchParams={searchParams} />
    </Suspense>
  );
}
