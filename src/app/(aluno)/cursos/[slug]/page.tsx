import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookOpen, Clock, FileText, Layers, Lock } from "lucide-react";
import { BotaoFavoritar } from "@/components/aluno/botao-favoritar";
import { duracaoCurta, textoDoBloqueio } from "@/components/aluno/formatos";
import { AcordeaoModulos } from "@/components/curso/acordeao-modulos";
import { CartaoInclui, type ItemInclui } from "@/components/curso/cartao-inclui";
import { CartaoProfessor } from "@/components/curso/cartao-professor";
import { ProgressoCurso } from "@/components/curso/progresso-curso";
import type { ModuloCurso } from "@/components/curso/tipos";
import { EstiloMarca } from "@/components/marca/estilo-marca";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao } from "@/components/ui/cartao";
import { EspacoImagem } from "@/components/ui/espaco-imagem";
import { Esqueleto } from "@/components/ui/esqueleto";
import { IconeQuadrado } from "@/components/ui/icone-quadrado";
import { urlDeImagemOuNula } from "@/lib/armazenamento/cliente";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { ROTULO_TIPO_PRODUTO } from "@/lib/catalogo/regras";
import { cursoDoAluno } from "@/lib/progresso/consultas";

export const metadata: Metadata = { title: "Curso" };

type Curso = NonNullable<Awaited<ReturnType<typeof cursoDoAluno>>>;
type Params = Promise<{ slug: string }>;

/** Estrutura da consulta -> forma do acordeão (aula travada leva o motivo e deixa de ser link). */
function paraAcordeao(modulos: Curso["modulos"]): ModuloCurso[] {
  return modulos.map((m) => ({
    id: m.id,
    numero: m.numero,
    titulo: m.titulo,
    totalAulas: m.totalAulas,
    duracao: duracaoCurta(m.duracaoSeg),
    estado: m.estado,
    aulas: m.aulas.map((a) => ({
      id: a.id,
      titulo: `${a.numero} · ${a.titulo}`,
      duracao: duracaoCurta(a.duracaoSeg),
      estado: a.estado === "bloqueada" ? "pendente" : a.estado,
      href: a.href,
      bloqueio: textoDoBloqueio(a) ?? undefined,
    })),
  }));
}

function itensInclui({ totais, modulos }: Curso): ItemInclui[] {
  const s = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  return [
    { icone: <BookOpen />, rotulo: s(totais.aulas, "aula", "aulas") },
    { icone: <Layers />, rotulo: s(modulos.length, "módulo", "módulos") },
    ...(totais.duracaoSeg > 0 ? [{ icone: <Clock />, rotulo: `${duracaoCurta(totais.duracaoSeg)} de conteúdo` }] : []),
    ...(totais.materiais > 0 ? [{ icone: <FileText />, rotulo: s(totais.materiais, "material complementar", "materiais complementares") }] : []),
  ];
}

/** Sem matrícula: o curso aparece (vitrine), com o caminho neutro para pedir acesso. */
function SemMatricula() {
  return (
    <Cartao raio={14} padding={18} className="flex items-center gap-3.5">
      <IconeQuadrado tamanho={42} tom="neutro">
        <Lock />
      </IconeQuadrado>
      <div className="min-w-0">
        <p className="m-0 text-sm font-bold">Você ainda não tem acesso a este conteúdo</p>
        <p className="m-0 text-[13px] text-muted">Fale com a equipe para se matricular.</p>
      </div>
    </Cartao>
  );
}

function Progresso({ curso }: { curso: Curso }) {
  if (!curso.matriculado) return <SemMatricula />;
  const primeira = curso.modulos[0]?.aulas[0];
  const destino = curso.proxima ?? (primeira ? { href: primeira.href, rotulo: `Rever · Aula ${primeira.numero}` } : null);
  if (!destino) return null;
  return <ProgressoCurso aulasConcluidas={curso.progresso.concluidas} totalAulas={curso.progresso.total} href={destino.href} textoBotao={destino.rotulo} />;
}

async function PaginaDoCurso({ params }: { params: Params }) {
  const [{ slug }, q] = await Promise.all([params, membroDaPagina(TODOS_OS_MEMBROS)]);
  const curso = await cursoDoAluno(q, slug);
  if (!curso) notFound();
  const { produto } = curso;
  // ponytail: foto do professor fica de fora até existir o envio de foto de perfil (avatar com iniciais).
  const capaUrl = await urlDeImagemOuNula(q.criador.id, produto.capa3x4Chave);
  const capa = (classe: string) => (
    <div className={classe}>
      <div className="overflow-hidden rounded-2xl">
        <EspacoImagem src={capaUrl ?? undefined} alt={`Capa de ${produto.titulo}`} dica="Capa do curso" proporcao="3/4" sizes="(min-width: 900px) 340px, 260px" prioritaria />
      </div>
    </div>
  );

  return (
    <div data-marca={produto.id} className="mx-auto grid max-w-[1280px] items-start gap-8 desk:grid-cols-[minmax(0,1fr)_340px]">
      <EstiloMarca cor={produto.corMarca} escopo={produto.id} />
      <div className="flex min-w-0 flex-col gap-7">
        {capa("max-w-[260px] desk:hidden")}
        <CabecalhoPagina
          variante="curso"
          eyebrow={ROTULO_TIPO_PRODUTO[produto.tipo]}
          titulo={produto.titulo}
          descricao={produto.descricao || undefined}
          acoes={curso.matriculado && q.membro.id ? <BotaoFavoritar alvo={{ produtoId: produto.id }} favoritoInicial={curso.favorito} /> : undefined}
        />
        <Progresso curso={curso} />
        <section className="flex flex-col gap-3.5" aria-labelledby="conteudo-do-curso">
          <h2 id="conteudo-do-curso" className="m-0 font-sans text-lg font-extrabold tracking-normal">
            Conteúdo do curso
          </h2>
          {curso.modulos.length ? (
            <AcordeaoModulos modulos={paraAcordeao(curso.modulos)} />
          ) : (
            <p className="m-0 text-sm text-muted">As aulas deste curso ainda não foram publicadas.</p>
          )}
        </section>
      </div>
      <aside className="flex flex-col gap-4 desk:sticky desk:top-[84px]">
        {capa("hidden desk:block")}
        <CartaoInclui itens={itensInclui(curso)} titulo={produto.tipo === "MENTORIA" ? "Esta mentoria inclui" : "Este curso inclui"} />
        {curso.professor && <CartaoProfessor nome={curso.professor.nome} />}
      </aside>
    </div>
  );
}

function EsqueletoCurso() {
  return (
    <div aria-busy="true" className="mx-auto grid max-w-[1280px] items-start gap-8 desk:grid-cols-[minmax(0,1fr)_340px]">
      <span className="sr-only">Carregando o curso</span>
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-3">
          <Esqueleto className="h-3 w-40" />
          <Esqueleto className="h-12 w-3/4 desk:h-14" />
          <Esqueleto className="h-4 w-full max-w-[640px]" />
        </div>
        <Esqueleto className="h-[76px] rounded-xl" />
        {[0, 1, 2, 3].map((i) => (
          <Esqueleto key={i} className="h-[68px] rounded-xl" />
        ))}
      </div>
      <div className="hidden flex-col gap-4 desk:flex">
        <Esqueleto className="aspect-3/4 rounded-2xl" />
        <Esqueleto className="h-40 rounded-2xl" />
      </div>
    </div>
  );
}

// params e sessão dentro de <Suspense>: exigência do cacheComponents.
export default function Pagina({ params }: { params: Params }) {
  return (
    <Suspense fallback={<EsqueletoCurso />}>
      <PaginaDoCurso params={params} />
    </Suspense>
  );
}
