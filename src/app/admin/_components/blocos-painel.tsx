import Link from "next/link";
import { BarChart3, BookOpen, Clapperboard, PlayCircle, Users } from "lucide-react";
import { CartaoKpi } from "@/components/admin/cartao-kpi";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Estatistica } from "@/components/ui/estatistica";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { acessosCacheados, kpisCacheados, maisAssistidasCacheadas, saudeCacheada } from "@/lib/painel/cache";
import { acontecendoAgora } from "@/lib/painel/consultas";
import { frasePeriodo, hojeEmBrasilia, lerIntervalo, rotuloDoPeriodo, type Intervalo } from "@/lib/painel/periodo";
import { formatarTaxa, fraseDoEvento, tempoRelativo, textoDaVariacao, variacao } from "@/lib/painel/regras";
import { GraficoAcessos } from "./grafico-acessos";

/**
 * Blocos do painel (/admin). Cada um é um Server Component assíncrono dentro do SEU <Suspense>:
 * confere sessão e papel (EQUIPE) por conta própria, lê o criador do HOST e o período da URL.
 * O cache dos agregados vem DEPOIS da guarda (src/lib/painel/cache.ts).
 */

export type ParametrosPainel = Promise<{ de?: string | string[]; ate?: string | string[]; periodo?: string | string[] }>;

async function contexto(parametros: ParametrosPainel): Promise<{ criadorId: string; periodo: Intervalo; hoje: string }> {
  const { criador } = await membroDaPagina(EQUIPE);
  const hoje = hojeEmBrasilia();
  return { criadorId: criador.id, periodo: lerIntervalo(await parametros, hoje), hoje };
}

const numero = new Intl.NumberFormat("pt-BR");
const link = (href: string, texto: string) => (
  <Link href={href} className={buttonVariants({ variant: "secundario", size: "36" })}>
    {texto}
  </Link>
);

function Kpi({ rotulo, atual, anterior, complemento }: { rotulo: string; atual: number; anterior: number; complemento?: string }) {
  const vr = variacao(atual, anterior);
  const v = textoDaVariacao(vr);
  // Os dois períodos zerados: "— vs. período anterior" não diz nada; fica a frase sozinha.
  const vazio = vr.tipo === "sem-dados";
  return (
    <CartaoKpi
      rotulo={rotulo}
      valor={numero.format(atual)}
      variacao={vazio ? "Sem movimento nos dois períodos" : v.texto}
      variacaoLeitor={vazio ? undefined : v.leitor}
      tom={v.tom}
      legenda={vazio ? "" : undefined}
      complemento={complemento}
    />
  );
}

export async function BlocoKpis({ parametros }: { parametros: ParametrosPainel }) {
  const { criadorId, periodo, hoje } = await contexto(parametros);
  const k = await kpisCacheados(criadorId, periodo);
  const conclusao = k.validas > 0 ? `Taxa de conclusão ${formatarTaxa(k.validasConcluidas / k.validas)}` : "Nenhuma matrícula valendo";
  return (
    <section aria-label={`Indicadores ${frasePeriodo(periodo, hoje)}`} className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
      <Kpi rotulo="Alunos ativos" atual={k.ativos} anterior={k.ativosAnt} />
      <Kpi rotulo="Novos alunos" atual={k.novos} anterior={k.novosAnt} />
      <Kpi rotulo="Matrículas" atual={k.matriculas} anterior={k.matriculasAnt} complemento={conclusao} />
      <Kpi rotulo="Aulas concluídas" atual={k.aulas} anterior={k.aulasAnt} />
    </section>
  );
}

export async function BlocoAcessos() {
  const { criadorId } = await contexto(Promise.resolve({}));
  const dias = await acessosCacheados(criadorId);
  const total = dias.reduce((s, d) => s + d.alunos, 0);
  return (
    <Cartao como="section" aria-labelledby="titulo-acessos" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <CartaoTitulo id="titulo-acessos" tamanho={15} como="h2">
          Acessos de alunos por dia
        </CartaoTitulo>
        <span className="text-xs text-muted">últimos 14 dias</span>
      </div>
      {total === 0 ? (
        <EstadoVazio
          icone={<BarChart3 />}
          titulo="Nenhum aluno assistiu aulas nos últimos 14 dias"
          descricao="As barras aparecem quando alunos matriculados começarem a assistir."
          acao={link("/admin/matriculas", "Matricular alunos")}
          className="py-8"
        />
      ) : (
        <GraficoAcessos dias={dias} />
      )}
    </Cartao>
  );
}

export async function BlocoAgora() {
  const { criadorId } = await contexto(Promise.resolve({}));
  const eventos = await acontecendoAgora(criadorId);
  const agora = new Date();
  return (
    <Cartao como="section" aria-labelledby="titulo-agora" className="flex flex-col gap-3.5">
      <CartaoTitulo id="titulo-agora" tamanho={15} como="h2">
        Acontecendo agora
      </CartaoTitulo>
      {eventos.length === 0 ? (
        <EstadoVazio
          icone={<Users />}
          titulo="Nada por aqui ainda"
          descricao="Cadastros, matrículas, publicações e aulas concluídas aparecem aqui assim que acontecerem."
          acao={link("/admin/membros", "Cadastrar membros")}
          className="py-8"
        />
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {eventos.map((e, i) => {
            const f = fraseDoEvento(e);
            return (
              <li key={i} className="flex items-start gap-2.5 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0">
                {f.pessoa ? (
                  <Avatar nome={f.pessoa} tamanho={30} />
                ) : (
                  <span aria-hidden className="grid size-[30px] shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
                    <Clapperboard className="size-3.5" />
                  </span>
                )}
                <div className="min-w-0 text-[13px] leading-[1.45]">
                  <b className="font-bold">{f.destaque}</b> {f.texto}
                  <div className="text-[11px] text-muted">
                    <time dateTime={e.quando.toISOString()}>{tempoRelativo(e.quando, agora)}</time>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Cartao>
  );
}

export async function BlocoMaisAssistidas({ parametros }: { parametros: ParametrosPainel }) {
  const { criadorId, periodo, hoje } = await contexto(parametros);
  const aulas = await maisAssistidasCacheadas(criadorId, periodo);
  const topo = aulas[0]?.visualizacoes ?? 1;
  return (
    <Cartao como="section" aria-labelledby="titulo-assistidos" className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <CartaoTitulo id="titulo-assistidos" tamanho={15} como="h2">
          Conteúdos mais assistidos
        </CartaoTitulo>
        <span className="text-xs text-muted">{rotuloDoPeriodo(periodo, hoje)}</span>
      </div>
      {aulas.length === 0 ? (
        <EstadoVazio
          icone={<PlayCircle />}
          titulo="Nenhuma aula assistida no período"
          descricao="O ranking conta quantos alunos assistiram cada aula por dia. Publique um curso e matricule alunos para começar."
          acao={link("/admin/conteudos", "Ver conteúdos")}
          className="py-8"
        />
      ) : (
        <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
          {aulas.map((a) => (
            <li key={a.aulaId} className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-3 text-[13px]">
                <div className="min-w-0">
                  <div className="truncate font-bold tracking-[.02em] uppercase">{a.titulo}</div>
                  <div className="truncate text-[11px] text-muted">{a.curso}</div>
                </div>
                <div className="shrink-0 font-bold tabular-nums">
                  {numero.format(a.visualizacoes)}
                  <span className="sr-only"> visualizações</span>
                </div>
              </div>
              <div aria-hidden className="h-[5px] overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (a.visualizacoes / topo) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Cartao>
  );
}

export async function BlocoSaude() {
  const { criadorId } = await contexto(Promise.resolve({}));
  const s = await saudeCacheada(criadorId);
  return (
    <Cartao como="section" aria-labelledby="titulo-saude" className="flex flex-col gap-3.5">
      <CartaoTitulo id="titulo-saude" tamanho={15} como="h2">
        Saúde dos produtos
      </CartaoTitulo>
      {s.publicados === 0 ? (
        <EstadoVazio
          icone={<BookOpen />}
          titulo="Publique seu primeiro curso"
          descricao="Produtos publicados, conclusão e alunos aparecem aqui depois da primeira publicação."
          acao={link("/admin/conteudos", "Ir para Conteúdos")}
          className="py-8"
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(92px,1fr))] gap-2.5">
          <Estatistica valor={numero.format(s.publicados)} rotulo={s.publicados === 1 ? "Produto publicado" : "Produtos publicados"} />
          <Estatistica valor={s.taxaMedia === null ? "—" : formatarTaxa(s.taxaMedia)} rotulo="Conclusão média" />
          <Estatistica valor={numero.format(s.alunosComMatricula)} rotulo="Alunos com matrícula" />
        </div>
      )}
    </Cartao>
  );
}
