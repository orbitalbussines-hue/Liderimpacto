import type { Metadata } from "next";
import { Suspense } from "react";
import { FileBadge } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha, TomSelo } from "@/components/admin/tabela-tipos";
import { AtualizarEnquantoGera } from "@/components/certificados/atualizar-enquanto-gera";
import { formatarTamanho } from "@/lib/armazenamento/regras";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { certificadosDoAdmin, versoesDoCertificado } from "@/lib/certificados/consultas";
import { SITUACOES_CERTIFICADO, type SituacaoCertificado, type SituacaoVersaoCertificado } from "@/lib/db/schema/_enums";
import { produtosParaMatricular } from "@/lib/matriculas/consultas";
import { dataHoraCurta, ehUuid } from "../conteudos/_components/comum";
import { FiltrosMatriculas } from "../matriculas/_components/filtros-matriculas";
import { dataCurta } from "../membros/_components/comum";
import { AcoesCertificado } from "./_components/acoes-certificado";
import { ABAS_CERTIFICADOS } from "./_components/comum";
import { DialogoVersoes, type VersaoDaLista } from "./_components/dialogo-versoes";

export const metadata: Metadata = { title: "Certificados" };

const POR_PAGINA = 20;
const COLUNAS: Coluna[] = [
  { titulo: "Aluno" },
  { titulo: "Curso", largura: 200 },
  { titulo: "Código", largura: 130 },
  { titulo: "Emitido em", largura: 110 },
  { titulo: "Versão atual", largura: 120 },
  { titulo: "Situação", largura: 120 },
  { titulo: "Ações", largura: 56 },
];
const ROTULO_SITUACAO: Record<SituacaoCertificado, string> = { EMITIDO: "Emitido", REVOGADO: "Revogado" };
const ROTULO_VERSAO: Record<SituacaoVersaoCertificado, VersaoDaLista["situacao"]> = { PRONTA: "Pronta", PENDENTE: "Gerando", FALHOU: "Falhou" };

/** Situação que a equipe enxerga: revogado vence; emitido com PDF ainda saindo = Gerando. */
function situacaoDaLinha(situacao: SituacaoCertificado, pdf: SituacaoVersaoCertificado | null): { texto: string; tom: TomSelo } {
  if (situacao === "REVOGADO") return { texto: "Revogado", tom: "warn" };
  if (pdf === null || pdf === "PENDENTE") return { texto: "Gerando", tom: "accent" };
  if (pdf === "FALHOU") return { texto: "PDF falhou", tom: "warn" };
  return { texto: "Emitido", tom: "ok" };
}

const qtd = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

type Busca = Promise<Record<string, string | string[] | undefined>>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

async function Certificados({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  // searchParams são entrada do usuário: só passa o que tem formato conhecido.
  const filtros = {
    busca: um(sp.q)?.slice(0, 100),
    produtoId: ehUuid(um(sp.curso) ?? "") ? um(sp.curso) : undefined,
    situacao: SITUACOES_CERTIFICADO.find((s) => s.toLowerCase() === um(sp.situacao)),
  };
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(um(sp.pagina) ?? "1", 10) || 1));
  const idVersoes = ehUuid(um(sp.versoes) ?? "") ? um(sp.versoes)! : null;
  const [lista, produtos, versoes] = await Promise.all([
    certificadosDoAdmin(criador.id, { ...filtros, pagina, porPagina: POR_PAGINA }),
    produtosParaMatricular(criador.id),
    idVersoes ? versoesDoCertificado(criador.id, idVersoes) : null,
  ]);

  const href = (mudar: Partial<Record<"q" | "curso" | "situacao" | "pagina" | "versoes", string | undefined>>) => {
    const p = new URLSearchParams();
    const atual = { q: filtros.busca, curso: filtros.produtoId, situacao: filtros.situacao?.toLowerCase(), pagina: pagina > 1 ? String(pagina) : undefined, versoes: undefined as string | undefined, ...mudar };
    for (const [k, v] of Object.entries(atual)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/admin/certificados?${qs}` : "/admin/certificados";
  };
  const produtoAtivo = produtos.find((p) => p.id === filtros.produtoId);
  const filtrosAtivos = [
    produtoAtivo && { rotulo: `Curso · ${produtoAtivo.titulo}`, hrefRemover: href({ curso: undefined, pagina: undefined }) },
    filtros.situacao && { rotulo: `Situação · ${ROTULO_SITUACAO[filtros.situacao]}`, hrefRemover: href({ situacao: undefined, pagina: undefined }) },
    filtros.busca && { rotulo: `Busca · ${filtros.busca}`, hrefRemover: href({ q: undefined, pagina: undefined }) },
  ].filter((f) => !!f);

  const linhas: Linha[] = lista.linhas.map((c) => {
    const s = situacaoDaLinha(c.situacao, c.pdf?.situacao ?? null);
    return [
      { tipo: "membro", nome: c.aluno.nome, email: c.aluno.email, src: c.aluno.imagem },
      { tipo: "texto", texto: c.curso.titulo },
      { tipo: "texto", texto: c.codigoLegivel, caixaAlta: true },
      { tipo: "data", texto: dataCurta(c.emitidoEm) },
      { tipo: "texto", texto: c.pdf ? `v${c.pdf.versao}` : "—", sub: c.pdf ? ROTULO_VERSAO[c.pdf.situacao] : undefined },
      { tipo: "selo", texto: s.texto, tom: s.tom },
      {
        tipo: "no",
        conteudo: (
          <AcoesCertificado
            certificado={{
              id: c.id,
              codigo: c.codigo,
              codigoLegivel: c.codigoLegivel,
              aluno: c.aluno.nome,
              curso: c.curso.titulo,
              revogado: c.situacao === "REVOGADO",
              // A última PRONTA é a que baixa; se a última for pendente/falhou, a action decide.
              podeBaixar: c.pdf !== null,
              versao: c.versao,
              hrefVersoes: href({ versoes: c.id }),
            }}
          />
        ),
      },
    ];
  });

  const alvoVersoes = idVersoes ? lista.linhas.find((c) => c.id === idVersoes) : undefined;
  const filtrando = Object.values(filtros).some(Boolean);
  const { resumo } = lista;
  return (
    <>
      <AtualizarEnquantoGera ativo={lista.linhas.some((c) => c.situacao === "EMITIDO" && (c.pdf === null || c.pdf.situacao === "PENDENTE"))} />
      <PaginaTabela
        titulo="Certificados"
        estatistica={
          <>
            <b className="text-ok">{qtd(resumo.emitidos, "emitido", "emitidos")}</b> · {qtd(resumo.revogados, "revogado", "revogados")} · {resumo.ultimos30} nos
            últimos 30 dias{resumo.pdfPendentes > 0 && ` · ${qtd(resumo.pdfPendentes, "PDF pendente", "PDFs pendentes")}`}
          </>
        }
        abas={ABAS_CERTIFICADOS}
        abaAtiva="Certificados"
        busca="Pesquise pelo nome, e-mail ou código..."
        valorBusca={filtros.busca}
        formBusca={{
          nome: "q",
          manter: Object.fromEntries(Object.entries({ curso: filtros.produtoId, situacao: filtros.situacao?.toLowerCase() }).filter(([, v]) => v)) as Record<string, string>,
        }}
        filtrosAtivos={filtrosAtivos}
        controles={
          <FiltrosMatriculas
            produtos={produtos.map((p) => ({ rotulo: p.titulo, href: href({ curso: p.id, pagina: undefined }), marcado: filtros.produtoId === p.id }))}
            situacoes={SITUACOES_CERTIFICADO.map((s) => ({ rotulo: ROTULO_SITUACAO[s], href: href({ situacao: s.toLowerCase(), pagina: undefined }), marcado: filtros.situacao === s }))}
          />
        }
        acaoPrincipal={{ rotulo: "Modelo do certificado", icone: FileBadge, href: "/admin/certificados/modelo" }}
        colunas={COLUNAS}
        linhas={linhas}
        chaves={lista.linhas.map((c) => c.id)}
        paginacao={{ pagina, porPagina: POR_PAGINA, total: lista.total, href: (n) => href({ pagina: String(n) }) }}
        vazio={
          filtrando
            ? { titulo: "Nenhum certificado encontrado", descricao: "Ajuste a busca ou remova os filtros." }
            : { titulo: "Nenhum certificado emitido ainda", descricao: "O certificado sai sozinho quando o aluno conclui todas as aulas e as avaliações obrigatórias do curso." }
        }
      />
      {versoes && (
        <DialogoVersoes
          titulo={alvoVersoes ? `${alvoVersoes.aluno.nome} · ${alvoVersoes.curso.titulo} · ${alvoVersoes.codigoLegivel}` : "Certificado"}
          hrefFechar={href({ versoes: undefined })}
          versoes={versoes.map((v) => ({
            versao: v.versao,
            situacao: ROTULO_VERSAO[v.situacao],
            detalhe: [`Pedida em ${dataHoraCurta(v.pedidaEm)}`, v.geradaEm && `gerada em ${dataHoraCurta(v.geradaEm)}`, v.tamanhoBytes && formatarTamanho(v.tamanhoBytes)].filter(Boolean).join(" · "),
            erro: v.erro,
          }))}
        />
      )}
    </>
  );
}

/** Certificados emitidos no criador do HOST (DONO e ADMIN): busca, filtros, versões e revogação. */
export default function PaginaCertificados({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Certificados searchParams={searchParams} />
    </Suspense>
  );
}
