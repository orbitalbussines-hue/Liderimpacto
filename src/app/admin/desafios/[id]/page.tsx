import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Estatistica } from "@/components/ui/estatistica";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { desafioParaEditar, opcoesDeMeta } from "@/lib/gamificacao/admin";
import { textoDaMeta } from "@/lib/gamificacao/regras";
import { listarGrupos } from "@/lib/membros/consultas";
import { ehUuid } from "../../conteudos/_components/comum";
import { dataCurta } from "../../membros/_components/comum";
import { SELO_SITUACAO, dataHora } from "../_components/comum";
import { FormDesafio } from "../_components/form-desafio";
import { SituacaoDesafio } from "./situacao-desafio";

export const metadata: Metadata = { title: "Desafio" };

type Params = Promise<{ id: string }>;

async function Editor({ params }: { params: Params }) {
  const { id } = await params;
  const { criador } = await membroDaPagina(EQUIPE);
  if (!ehUuid(id)) notFound();
  const agora = new Date();
  const [d, metas, grupos] = await Promise.all([desafioParaEditar(criador.id, id, agora), opcoesDeMeta(criador.id), listarGrupos(criador.id)]);
  if (!d) notFound();
  const selo = SELO_SITUACAO[d.momento];
  const concluidos = d.participantes.filter((p) => p.concluidoEm).length;
  const c = d.campos;

  return (
    <>
      <CabecalhoPagina
        variante="admin"
        titulo={c.titulo}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <Selo tom={selo.tom}>{selo.texto}</Selo>
            {textoDaMeta(c.metaTipo, d.meta)} · {dataHora(c.inicioEm)} até {dataHora(c.fimEm)}
          </span>
        }
      />
      <div className="grid items-start gap-5 desk:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Cartao padding={24} como="section" aria-label="Dados do desafio">
            <FormDesafio
              desafio={{
                id: d.id,
                versao: d.versao.toISOString(),
                somenteLeitura: d.situacao === "ENCERRADO",
                campos: { ...c, inicioEm: c.inicioEm.toISOString(), fimEm: c.fimEm.toISOString() },
              }}
              opcoes={{ ...metas, grupos: grupos.map((g) => ({ id: g.id, nome: g.nome })) }}
            />
          </Cartao>

          <Cartao padding={0} como="section" aria-labelledby="titulo-participantes">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
              <CartaoTitulo tamanho={15} como="h2" id="titulo-participantes">
                Participantes
              </CartaoTitulo>
              <span className="text-[13px] text-muted">Progresso calculado do que cada um fez dentro do período</span>
            </div>
            {d.participantes.length === 0 ? (
              <EstadoVazio icone={<Users />} titulo="Ninguém participando ainda" descricao="Depois de publicado, o aluno do público clica em Participar na tela Conquistas." />
            ) : (
              <ul className="m-0 list-none border-t border-border p-0">
                {d.participantes.map((p) => (
                  <li key={p.participacaoId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-border px-5 py-3 last:border-b-0 min-[640px]:grid-cols-[minmax(0,1fr)_200px_110px]">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar nome={p.nome} src={p.imagem} tamanho={32} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold">{p.nome}</div>
                        <div className="truncate text-xs text-muted">Entrou em {dataCurta(p.entrouEm)}</div>
                      </div>
                    </div>
                    <div className="col-span-2 row-start-2 flex items-center gap-2 min-[640px]:col-span-1 min-[640px]:row-start-auto">
                      <BarraProgresso valor={(p.atual * 100) / d.meta} rotulo={`Progresso de ${p.nome}`} className="flex-1" />
                      <span className="shrink-0 text-xs text-muted tabular-nums">
                        {p.atual}/{d.meta}
                      </span>
                    </div>
                    <div className="col-start-2 row-start-1 text-right min-[640px]:col-start-auto min-[640px]:row-start-auto">
                      {p.concluidoEm ? <Selo tom="ok">Concluído</Selo> : <span className="text-xs text-muted">Em andamento</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>

        <aside className="flex flex-col gap-5">
          <Cartao padding={20} como="section" aria-labelledby="titulo-situacao" className="flex flex-col gap-4">
            <CartaoTitulo tamanho={15} como="h2" id="titulo-situacao">
              Situação
            </CartaoTitulo>
            <div className="grid grid-cols-2 gap-2">
              <Estatistica valor={d.participantes.length} rotulo={d.participantes.length === 1 ? "participante" : "participantes"} />
              <Estatistica valor={concluidos} rotulo={concluidos === 1 ? "concluiu" : "concluíram"} />
            </div>
            <p className="m-0 text-[13px] leading-relaxed text-muted">
              {d.situacao === "RASCUNHO"
                ? "Rascunho: só a equipe vê. Ao publicar, o público escolhido pode participar até o fim."
                : d.situacao === "ENCERRADO"
                  ? "Encerrado: ninguém conclui mais. Os bônus e recompensas de quem concluiu ficam valendo."
                  : d.momento === "EM_BREVE"
                    ? "Publicado e agendado: o aluno já pode participar; o progresso conta a partir do início."
                    : "Ativo: ao alcançar a meta, o aluno conclui e recebe o bônus uma única vez."}
            </p>
            <SituacaoDesafio desafio={{ id: d.id, titulo: c.titulo, situacao: d.situacao, participantes: d.participantes.length, versao: d.versao.toISOString() }} />
          </Cartao>
          {c.recompensa && (
            <Cartao padding={20} como="section" aria-labelledby="titulo-recompensa" className="flex flex-col gap-2">
              <CartaoTitulo tamanho={15} como="h2" id="titulo-recompensa">
                Recompensa
              </CartaoTitulo>
              <p className="m-0 text-sm">{c.recompensa}</p>
              <Link href="/admin/desafios/recompensas" className={buttonVariants({ variant: "link", className: "self-start px-0" })}>
                Ver entregas
              </Link>
            </Cartao>
          )}
        </aside>
      </div>
    </>
  );
}

/** Editor do desafio (DONO e ADMIN): dados, situação e participantes com progresso. */
export default function PaginaDesafio({ params }: { params: Params }) {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/desafios" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Desafios
      </Link>
      <Suspense fallback={null}>
        <Editor params={params} />
      </Suspense>
    </div>
  );
}
