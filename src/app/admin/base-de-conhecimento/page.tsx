import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Coluna, Linha } from "@/components/admin/tabela-tipos";
import { Aviso } from "@/components/ui/aviso";
import { iaConfigurada } from "@/lib/assistente/cliente";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { cursosDoCriador, fontesDoCriador, lerFiltroFonte, totaisDaBase } from "@/lib/conhecimento/consultas";
import { ROTULO_FONTE } from "@/lib/conhecimento/regras";
import { FONTES_CONHECIMENTO } from "@/lib/db/schema/_enums";
import { dataHoraCurta, ehUuid } from "../conteudos/_components/comum";
import { AcoesTexto } from "./_components/acoes-texto";
import { ABAS_BASE, MSG_IA_NAO_CONFIGURADA_BASE, ROTA_BASE } from "./_components/comum";
import { FiltrosBase } from "./_components/filtros-base";
import { InterruptorFonte } from "./_components/interruptor-fonte";

export const metadata: Metadata = { title: "Base de conhecimento" };

const COLUNAS: Coluna[] = [
  { titulo: "Fonte" },
  { titulo: "Curso", largura: 200 },
  { titulo: "Trechos", largura: 90 },
  { titulo: "Atualizado em", largura: 140 },
  { titulo: "Incluída", largura: 100 },
  { titulo: "Ações", largura: 56 },
];

type Busca = Promise<Record<string, string | string[] | undefined>>;

function href(f: { tipo?: string | null; curso?: string | null }) {
  const p = new URLSearchParams();
  if (f.tipo) p.set("tipo", f.tipo);
  if (f.curso) p.set("curso", f.curso);
  const q = p.toString();
  return q ? `${ROTA_BASE}?${q}` : ROTA_BASE;
}

async function Base({ searchParams }: { searchParams: Busca }) {
  const { criador } = await membroDaPagina(EQUIPE);
  const sp = await searchParams;
  const tipo = lerFiltroFonte(sp.tipo);
  const curso = typeof sp.curso === "string" && ehUuid(sp.curso) ? sp.curso : null;
  const [lista, cursos, totais] = await Promise.all([fontesDoCriador(criador.id, { fonte: tipo, produtoId: curso }), cursosDoCriador(criador.id), totaisDaBase(criador.id)]);
  const nomeCurso = cursos.find((c) => c.id === curso)?.titulo ?? null;

  const linhas: Linha[] = lista.map((d) => [
    { tipo: "texto", texto: d.titulo, sub: ROTULO_FONTE[d.fonte] },
    { tipo: "texto", texto: d.curso ?? (d.fonte === "TEXTO" ? "Todos os alunos" : "—") },
    { tipo: "numeroDestaque", texto: String(d.trechos) },
    { tipo: "data", texto: dataHoraCurta(d.atualizadoEm) },
    { tipo: "no", conteudo: <InterruptorFonte documentoId={d.id} titulo={d.titulo} incluir={d.incluir} versao={d.versao} /> },
    d.fonte === "TEXTO" ? { tipo: "no", conteudo: <AcoesTexto documentoId={d.id} titulo={d.titulo} versao={d.versao} /> } : { tipo: "texto", texto: "" },
  ]);

  const filtros = (
    <FiltrosBase
      tipos={[
        { rotulo: "Todos os tipos", href: href({ curso }), marcado: !tipo },
        ...FONTES_CONHECIMENTO.map((f) => ({ rotulo: ROTULO_FONTE[f], href: href({ tipo: f, curso }), marcado: tipo === f })),
      ]}
      cursos={[{ rotulo: "Todos os cursos", href: href({ tipo }), marcado: !curso }, ...cursos.map((c) => ({ rotulo: c.titulo, href: href({ tipo, curso: c.id }), marcado: curso === c.id }))]}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {!iaConfigurada() && <Aviso tom="info">{MSG_IA_NAO_CONFIGURADA_BASE}</Aviso>}
      <PaginaTabela
        titulo="Base de conhecimento"
        estatistica={`${totais.documentos} ${totais.documentos === 1 ? "fonte incluída" : "fontes incluídas"} · ${totais.trechos} trechos`}
        abas={ABAS_BASE}
        abaAtiva="Fontes"
        semBusca
        controles={filtros}
        filtrosAtivos={[
          ...(tipo ? [{ rotulo: `Tipo · ${ROTULO_FONTE[tipo]}`, hrefRemover: href({ curso }) }] : []),
          ...(nomeCurso ? [{ rotulo: `Curso · ${nomeCurso}`, hrefRemover: href({ tipo }) }] : []),
        ]}
        acaoPrincipal={{ rotulo: "Novo texto", icone: Plus, href: `${ROTA_BASE}/textos/novo` }}
        colunas={COLUNAS}
        linhas={linhas}
        chaves={lista.map((d) => d.id)}
        vazio={
          tipo || curso
            ? { titulo: "Nenhuma fonte com esses filtros", descricao: "Ajuste o tipo ou o curso." }
            : {
                titulo: "A base ainda está vazia",
                descricao: "Ela se monta sozinha com as descrições e as legendas das aulas. Escreva também textos como FAQ e política de certificados.",
              }
        }
      />
      <p className="m-0 text-xs leading-relaxed text-muted">
        A transcrição vem da legenda da aula; descrições de aulas e cursos entram ao salvar. PDFs ainda não entram na base.
      </p>
    </div>
  );
}

/** Base de conhecimento do assistente (DONO e ADMIN, ADR-0014): fontes, filtros, textos da equipe. */
export default function PaginaBaseDeConhecimento({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={null}>
      <Base searchParams={searchParams} />
    </Suspense>
  );
}
