import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { buttonVariants } from "@/components/ui/button";
import { SegmentosLink } from "@/components/ui/segmentos-link";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { feedbacksDoCriador, resumoFeedbackPorAula } from "@/lib/feedbacks/consultas";
import { produtosParaMatricular } from "@/lib/matriculas/consultas";
import { dataHoraCurta } from "../../conteudos/_components/comum";
import { CarregandoLista } from "../_components/carregando";
import { ABAS_MATRICULAS, lerPagina, linkCom, POR_PAGINA, um, uuid, type Busca } from "../_components/comum";
import { MenusFiltro } from "../_components/menus-filtro";
import { Status } from "../_components/status";

export const metadata: Metadata = { title: "Feedbacks de conteúdo" };

const BASE = "/admin/matriculas/feedbacks";
const COLUNAS_RESPOSTAS: Coluna[] = [
  { titulo: "Aluno", largura: 230 },
  { titulo: "Aula", largura: 220 },
  { titulo: "Resposta", largura: 110 },
  { titulo: "Comentário" },
  { titulo: "Quando", largura: 130 },
];
const COLUNAS_AULAS: Coluna[] = [
  { titulo: "Aula" },
  { titulo: "Acharam útil", largura: 190 },
  { titulo: "Respostas", largura: 100 },
  { titulo: "Comentários", largura: 110 },
  { titulo: "Ação", largura: 130 },
];

const plural = (n: number, singular: string, varios: string) => `${n} ${n === 1 ? singular : varios}`;

async function Feedbacks({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  const porAula = um(sp.ver) === "aulas";
  const resposta = um(sp.resposta);
  const filtros = {
    produtoId: uuid(sp.produto),
    aulaId: porAula ? undefined : uuid(sp.aula),
    util: resposta === "util" ? true : resposta === "nao-util" ? false : undefined,
    soComComentario: !porAula && um(sp.comentario) === "sim",
  };
  const pagina = lerPagina(sp.pagina);
  const [resumo, produtos, lista] = await Promise.all([
    resumoFeedbackPorAula(criador.id, filtros.produtoId),
    produtosParaMatricular(criador.id),
    porAula ? null : feedbacksDoCriador(criador.id, { ...filtros, pagina, porPagina: POR_PAGINA }),
  ]);

  const atual = {
    ver: porAula ? "aulas" : undefined,
    produto: filtros.produtoId,
    aula: filtros.aulaId,
    resposta: porAula || filtros.util === undefined ? undefined : filtros.util ? "util" : "nao-util",
    comentario: filtros.soComComentario ? "sim" : undefined,
  };
  const href = (mudar: Record<string, string | undefined>) => linkCom(BASE, atual, mudar);
  const produtoAtivo = produtos.find((p) => p.id === filtros.produtoId);
  const aulaAtiva = resumo.find((a) => a.aulaId === filtros.aulaId);
  const filtrosAtivos = [
    produtoAtivo && { rotulo: `Curso · ${produtoAtivo.titulo}`, hrefRemover: href({ produto: undefined, aula: undefined }) },
    filtros.aulaId && { rotulo: `Aula · ${aulaAtiva?.aula ?? "selecionada"}`, hrefRemover: href({ aula: undefined }) },
    atual.resposta && { rotulo: atual.resposta === "util" ? "Só “útil”" : "Só “não útil”", hrefRemover: href({ resposta: undefined }) },
    filtros.soComComentario && { rotulo: "Só com comentário", hrefRemover: href({ comentario: undefined }) },
  ].filter((f) => !!f);

  const respostas = resumo.reduce((s, a) => s + a.avaliacoes, 0);
  const uteis = resumo.reduce((s, a) => s + a.uteis, 0);
  const estatistica = respostas
    ? `${plural(respostas, "resposta", "respostas")} · ${Math.round((uteis * 100) / respostas)}% acharam útil · ${plural(resumo.length, "aula avaliada", "aulas avaliadas")}`
    : "Nenhuma resposta ainda";

  // ponytail: o resumo vem inteiro (uma linha por aula avaliada) e pagina aqui; paginar no SQL se passar de milhares de aulas.
  const aulasDaPagina = resumo.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const linhas: Linha[] = lista
    ? lista.linhas.map((f) => [
        { tipo: "membro", nome: f.nome, email: f.email },
        { tipo: "texto", texto: f.aula, sub: f.produto },
        {
          tipo: "no",
          conteudo: f.util ? (
            <Status icone={<ThumbsUp />} tom="ok">
              Útil
            </Status>
          ) : (
            <Status icone={<ThumbsDown />} tom="warn">
              Não útil
            </Status>
          ),
        },
        {
          tipo: "no",
          conteudo: f.comentario ? (
            <p className="m-0 line-clamp-2 break-words whitespace-normal" title={f.comentario}>
              {f.comentario}
            </p>
          ) : (
            <span className="text-muted">—</span>
          ),
        },
        { tipo: "data", texto: dataHoraCurta(f.quando) },
      ])
    : aulasDaPagina.map((a) => [
        { tipo: "texto", texto: a.aula, sub: a.produto },
        {
          tipo: "no",
          conteudo: <BarraProgresso valor={a.percentualUtil} rotulo={`Acharam útil a aula ${a.aula}`} mostrarPercentual />,
        },
        { tipo: "no", conteudo: <span className="tabular-nums">{a.avaliacoes}</span> },
        { tipo: "no", conteudo: <span className="tabular-nums text-muted">{a.comentarios}</span> },
        {
          tipo: "no",
          conteudo: (
            <Link href={linkCom(BASE, {}, { produto: filtros.produtoId, aula: a.aulaId })} className={buttonVariants({ variant: "link", className: "h-auto p-0" })}>
              Ver respostas
            </Link>
          ),
        },
      ]);

  const filtrando = filtrosAtivos.length > 0;
  return (
    <PaginaTabela
      titulo="Matrículas"
      estatistica={`Feedbacks · ${estatistica}`}
      abas={ABAS_MATRICULAS}
      abaAtiva="Feedbacks de conteúdo"
      semBusca
      filtrosAtivos={filtrosAtivos}
      controles={
        <>
          <SegmentosLink
            aria-label="Visão dos feedbacks"
            opcoes={[
              { rotulo: "Respostas", href: linkCom(BASE, {}, { produto: filtros.produtoId }), ativo: !porAula },
              { rotulo: "Por aula", href: linkCom(BASE, {}, { produto: filtros.produtoId, ver: "aulas" }), ativo: porAula },
            ]}
          />
          <MenusFiltro
            menus={[
              { rotulo: "Curso", itens: produtos.map((p) => ({ rotulo: p.titulo, href: href({ produto: p.id, aula: undefined }), marcado: filtros.produtoId === p.id })) },
              ...(porAula
                ? []
                : [
                    {
                      rotulo: "Resposta",
                      itens: [
                        { rotulo: "Todas", href: href({ resposta: undefined }), marcado: !atual.resposta },
                        { rotulo: "Útil", href: href({ resposta: "util" }), marcado: atual.resposta === "util" },
                        { rotulo: "Não útil", href: href({ resposta: "nao-util" }), marcado: atual.resposta === "nao-util" },
                      ],
                    },
                    {
                      rotulo: "Comentário",
                      itens: [
                        { rotulo: "Com ou sem", href: href({ comentario: undefined }), marcado: !filtros.soComComentario },
                        { rotulo: "Só com comentário", href: href({ comentario: "sim" }), marcado: filtros.soComComentario },
                      ],
                    },
                  ]),
            ]}
          />
        </>
      }
      colunas={porAula ? COLUNAS_AULAS : COLUNAS_RESPOSTAS}
      linhas={linhas}
      chaves={lista ? lista.linhas.map((f) => f.id) : aulasDaPagina.map((a) => a.aulaId)}
      paginacao={{ pagina, porPagina: POR_PAGINA, total: lista ? lista.total : resumo.length, href: (n) => href({ pagina: String(n) }) }}
      vazio={
        filtrando
          ? { titulo: "Nenhuma resposta neste filtro", descricao: "Remova algum filtro para ver mais respostas." }
          : { titulo: "Nenhum feedback ainda", descricao: "Quando os alunos marcarem uma aula como útil ou não útil, as respostas aparecem aqui." }
      }
    />
  );
}

/** Feedback de conteúdo (RN-202): respostas mais recentes e % de "útil" por aula, piores primeiro. */
export default function PaginaFeedbacks({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={<CarregandoLista />}>
      <Feedbacks searchParams={searchParams} />
    </Suspense>
  );
}
