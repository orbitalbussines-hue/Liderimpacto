import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Celula, Coluna, Linha } from "@/components/admin/tabela-tipos";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { contagemDosEventos, eventosDoAdmin, lerAbaEventos, type AbaEventos, type EventoDoAdmin } from "@/lib/eventos/admin";
import { momentoDoEvento, quandoDoEvento } from "@/lib/eventos/regras";
import { dataHoraCurta } from "../conteudos/_components/comum";
import { AcoesEvento } from "./_components/acoes-evento";
import { duracaoTexto } from "@/lib/eventos/tela";
import { ABAS_EVENTOS_TABELA, hrefAba, ROTULO_ABA, textoDoPublico } from "./_components/comum";

export const metadata: Metadata = { title: "Eventos ao vivo" };

const COLUNAS: Coluna[] = [
  { titulo: "Evento" },
  { titulo: "Público", largura: 190 },
  { titulo: "Confirmados", largura: 110 },
  { titulo: "Situação", largura: 130 },
  { titulo: "Ações", largura: 56 },
];

type Busca = Promise<Record<string, string | string[] | undefined>>;

function seloDaSituacao(e: EventoDoAdmin, agora: Date): Celula {
  if (e.situacao === "RASCUNHO") return { tipo: "selo", texto: "Rascunho", tom: "neutro" };
  if (e.situacao === "CANCELADO") return { tipo: "selo", texto: "Cancelado", tom: "warn" };
  const m = momentoDoEvento({ inicioEm: e.inicioEm, duracaoMin: e.duracaoMin }, agora);
  if (m === "ABERTO") return { tipo: "selo", texto: "Ao vivo agora", tom: "accent" };
  return m === "ENCERRADO" ? { tipo: "selo", texto: "Encerrado", tom: "neutro" } : { tipo: "selo", texto: "Publicado", tom: "ok" };
}

const VAZIO: Record<AbaEventos, { titulo: string; descricao: string }> = {
  proximos: { titulo: "Nenhum encontro marcado", descricao: "Crie um evento, informe o link da sala e publique: o público recebe um aviso no sino." },
  passados: { titulo: "Nenhum encontro realizado ainda", descricao: "Os encontros publicados aparecem aqui depois do fim, para você ligar a gravação." },
  rascunhos: { titulo: "Nenhum rascunho", descricao: "Eventos criados e ainda não publicados ficam aqui." },
  cancelados: { titulo: "Nenhum encontro cancelado", descricao: "Encontros cancelados ficam aqui para consulta, com quem tinha confirmado." },
};

async function Eventos({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  const aba = lerAbaEventos(sp.aba);
  const busca = (typeof sp.q === "string" ? sp.q.trim() : "").slice(0, 100);
  const agora = new Date();
  const [lista, n] = await Promise.all([eventosDoAdmin(criador.id, aba, agora, busca), contagemDosEventos(criador.id, agora)]);

  const linhas: Linha[] = lista.map((e) => {
    const fim = new Date(e.inicioEm.getTime() + e.duracaoMin * 60_000);
    const publico = textoDoPublico(e.publico, e.produtoTitulo, e.grupos);
    return [
      { tipo: "texto", texto: e.titulo, sub: `${dataHoraCurta(e.inicioEm)} · ${duracaoTexto(e.duracaoMin)}` },
      { tipo: "texto", texto: publico },
      { tipo: "numeroDestaque", texto: e.situacao === "RASCUNHO" ? "—" : String(e.inscritos) },
      seloDaSituacao(e, agora),
      {
        tipo: "no",
        conteudo: (
          <AcoesEvento
            evento={{ id: e.id, titulo: e.titulo, situacao: e.situacao, quando: quandoDoEvento(e.inicioEm), publico, inscritos: e.inscritos, encerrado: fim <= agora, versao: e.versao }}
          />
        ),
      },
    ];
  });

  const manter = aba === "proximos" ? undefined : { aba };
  return (
    <PaginaTabela
      titulo="Eventos ao vivo"
      estatistica={
        <>
          <b className="text-ok">{n.proximos === 1 ? "1 próximo" : `${n.proximos} próximos`}</b> · {n.passados} {n.passados === 1 ? "realizado" : "realizados"} · {n.rascunhos} em rascunho
        </>
      }
      abas={ABAS_EVENTOS_TABELA}
      abaAtiva={ROTULO_ABA[aba]}
      busca="Pesquise pelo título..."
      valorBusca={busca || undefined}
      formBusca={{ nome: "q", manter }}
      filtrosAtivos={busca ? [{ rotulo: `Busca · ${busca}`, hrefRemover: hrefAba(aba) }] : []}
      acaoPrincipal={{ rotulo: "Novo evento", icone: Plus, href: "/admin/eventos/novo" }}
      colunas={COLUNAS}
      linhas={linhas}
      chaves={lista.map((e) => e.id)}
      vazio={busca ? { titulo: "Nenhum evento encontrado", descricao: "Ajuste a busca." } : VAZIO[aba]}
    />
  );
}

/** Eventos ao vivo do criador do HOST (DONO e ADMIN): próximos, passados, rascunhos e cancelados. */
export default function PaginaEventos({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Eventos searchParams={searchParams} />
    </Suspense>
  );
}
