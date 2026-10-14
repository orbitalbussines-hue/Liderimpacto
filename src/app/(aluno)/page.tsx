import { Suspense } from "react";
import { BookOpen } from "lucide-react";
import { duracaoCurta, primeiroNome } from "@/components/aluno/formatos";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Esqueleto } from "@/components/ui/esqueleto";
import { Destaque } from "@/components/vitrine/destaque";
import { EsqueletoFileira } from "@/components/vitrine/esqueleto-fileira";
import { Fileira } from "@/components/vitrine/fileira";
import type { ItemFileira } from "@/components/vitrine/tipos";
import { urlDeImagemOuNula } from "@/lib/armazenamento/cliente";
import type { MembroDaRequisicao } from "@/lib/auth/autorizacao";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { ROTULO_TIPO_PRODUTO } from "@/lib/catalogo/regras";
import { cursosDoAluno } from "@/lib/matriculas/consultas";
import { comImagens, continuarAssistindo, cursoDoAluno, mentorias, minhaLista, novidades, type ItemCartao } from "@/lib/progresso/consultas";
import { top10 } from "@/lib/progresso/top10";
import { trilhasParaVitrine } from "@/lib/trilhas/consultas";

/**
 * VITRINE do aluno (README tela 2): destaque + fileiras padrão. Cada bloco num <Suspense> com o
 * próprio esqueleto (cacheComponents: tudo que lê sessão fica dentro de Suspense). Fileira sem
 * itens não aparece (SISTEMA.md §6). "Trilhas para você" = trilhas publicadas que o membro vê (passo 7).
 * Destaque: enquanto o construtor (passo 9) não existe, é o curso da aula do "Continuar"
 * (senão o da matrícula mais recente; equipe sem matrícula: o curso novo mais recente).
 */

type Quem = MembroDaRequisicao;
type CursoMatriculado = Awaited<ReturnType<typeof cursosDoAluno>>[number];

/** Só o que o cartão usa (o resto não viaja para o cliente). */
async function paraFileira(criadorId: string, itens: readonly (ItemCartao & { progresso?: number })[]): Promise<ItemFileira[]> {
  return (await comImagens(criadorId, itens)).map((i) => ({ id: i.id, titulo: i.titulo, subtitulo: i.subtitulo, imagemUrl: i.imagemUrl, href: i.href, progresso: i.progresso }));
}

const slugDoHref = (href?: string) => href?.match(/^\/cursos\/([a-z0-9-]+)$/)?.[1];

async function BlocoDestaque({ q, cursos }: { q: Quem; cursos: CursoMatriculado[] }) {
  const [continuar, novas] = await Promise.all([continuarAssistindo(q, 1), novidades(q, 5)]);
  const slug =
    cursos.find((c) => c.titulo === continuar[0]?.produtoTitulo)?.slug ?? cursos[0]?.slug ?? slugDoHref(novas.find((n) => n.tipo === "PRODUTO")?.href);
  const curso = slug ? await cursoDoAluno(q, slug) : null;
  if (!curso) return null;
  const { produto, proxima, totais } = curso;
  const imagemUrl = (await urlDeImagemOuNula(q.criador.id, produto.capa16x9Chave)) ?? undefined;
  const retomar = proxima?.rotulo.startsWith("Continuar") ? `Continue de onde parou: aula ${proxima.numero}.` : "";
  const novidade = novas[0];
  return (
    <Destaque
      titulo={produto.titulo}
      descricao={[produto.descricao, retomar].filter(Boolean).join(" ")}
      imagemUrl={imagemUrl}
      meta={[ROTULO_TIPO_PRODUTO[produto.tipo], totais.duracaoSeg > 0 ? duracaoCurta(totais.duracaoSeg) : ""].filter(Boolean)}
      badge={totais.aulas > 0 ? `${totais.aulas} ${totais.aulas === 1 ? "AULA" : "AULAS"}` : undefined}
      botaoPrincipal={{ texto: "Assistir", href: proxima?.href ?? `/cursos/${produto.slug}` }}
      botaoSecundario={{ texto: "Mais informações", href: `/cursos/${produto.slug}` }}
      avisos={novidade ? { novidade: `Novo: ${novidade.titulo}` } : undefined}
      mostrarAvisos={!!novidade}
    />
  );
}

async function FileiraContinuar({ q }: { q: Quem }) {
  const itens = await paraFileira(q.criador.id, await continuarAssistindo(q));
  return <Fileira titulo={`Continue assistindo, ${primeiroNome(q.usuario.nome)}`} variante="progresso" itens={itens} />;
}

async function FileiraTop10({ q }: { q: Quem }) {
  return <Fileira titulo="Top 10 aulas da semana" tag="TOP 10" variante="top10" itens={await paraFileira(q.criador.id, await top10(q.criador.id))} />;
}

async function FileiraNovidades({ q }: { q: Quem }) {
  return <Fileira titulo="Novidades na plataforma" variante="novo" itens={await paraFileira(q.criador.id, await novidades(q))} />;
}

async function FileiraTrilhas({ q }: { q: Quem }) {
  return <Fileira titulo="Trilhas para você" itens={await paraFileira(q.criador.id, await trilhasParaVitrine(q))} />;
}

async function FileiraMentorias({ q }: { q: Quem }) {
  return <Fileira titulo="Mentorias gravadas" itens={await paraFileira(q.criador.id, await mentorias(q))} />;
}

async function FileiraLista({ q }: { q: Quem }) {
  return <Fileira titulo="Minha lista" itens={await paraFileira(q.criador.id, await minhaLista(q))} />;
}

const esqueletoDestaque = <Esqueleto className="min-h-[520px] rounded-3xl desk:min-h-[600px]" />;

async function Vitrine() {
  const q = await membroDaPagina(TODOS_OS_MEMBROS);
  const cursos = q.membro.id ? await cursosDoAluno(q.criador.id, q.membro.id, new Date()) : [];
  const semCursos = q.membro.papel === "ALUNO" && cursos.length === 0;
  return (
    <>
      {semCursos ? (
        <>
          <h1 className="sr-only">Início</h1>
          <EstadoVazio
            comMoldura
            icone={<BookOpen />}
            titulo="Você ainda não tem cursos"
            descricao={`Assim que a equipe da ${q.criador.nome} liberar o seu acesso, seus cursos aparecem aqui. Se você já fez a compra, fale com a equipe.`}
            className="py-16"
          />
        </>
      ) : (
        // O Destaque traz o <h1> da página (título do curso).
        <Suspense fallback={esqueletoDestaque}>
          <BlocoDestaque q={q} cursos={cursos} />
        </Suspense>
      )}
      <Suspense fallback={<EsqueletoFileira rotulo="Carregando Continue assistindo" />}>
        <FileiraContinuar q={q} />
      </Suspense>
      <Suspense fallback={<EsqueletoFileira estreito rotulo="Carregando Top 10" />}>
        <FileiraTop10 q={q} />
      </Suspense>
      <Suspense fallback={<EsqueletoFileira rotulo="Carregando novidades" />}>
        <FileiraNovidades q={q} />
      </Suspense>
      <Suspense fallback={<EsqueletoFileira rotulo="Carregando trilhas" />}>
        <FileiraTrilhas q={q} />
      </Suspense>
      <Suspense fallback={<EsqueletoFileira rotulo="Carregando mentorias" />}>
        <FileiraMentorias q={q} />
      </Suspense>
      <Suspense fallback={<EsqueletoFileira rotulo="Carregando Minha lista" />}>
        <FileiraLista q={q} />
      </Suspense>
    </>
  );
}

export default function Inicio() {
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-[22px] desk:gap-[34px]">
      <Suspense
        fallback={
          <>
            {esqueletoDestaque}
            <EsqueletoFileira />
            <EsqueletoFileira estreito />
          </>
        }
      >
        <Vitrine />
      </Suspense>
    </div>
  );
}
