import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Selo } from "@/components/ui/selo";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { eventoParaEditar, inscritosDoEvento, opcoesDoEvento } from "@/lib/eventos/admin";
import { fimDoEvento, momentoDoEvento, quandoDoEvento, ROTA_EVENTOS } from "@/lib/eventos/regras";
import { campoDeBrasilia } from "@/lib/validators/eventos";
import { dataHoraCurta, ehUuid } from "../../conteudos/_components/comum";
import { duracaoTexto } from "@/lib/eventos/tela";
import { textoDoPublico } from "../_components/comum";
import { FormEvento } from "../_components/form-evento";
import { SituacaoEvento } from "../_components/situacao-evento";

export const metadata: Metadata = { title: "Editar evento" };

type Params = Promise<{ id: string }>;

const SELO = {
  RASCUNHO: { tom: "neutro", texto: "Rascunho" },
  PUBLICADO: { tom: "ok", texto: "Publicado" },
  CANCELADO: { tom: "warn", texto: "Cancelado" },
} as const;

async function Editor({ params }: { params: Params }) {
  const { id } = await params;
  const { criador } = await membroDaPagina(EQUIPE);
  if (!ehUuid(id)) notFound();
  const [e, opcoes] = await Promise.all([eventoParaEditar(criador.id, id), opcoesDoEvento(criador.id)]);
  if (!e) notFound();
  const inscritos = e.situacao === "RASCUNHO" ? [] : await inscritosDoEvento(criador.id, e.id);
  const agora = new Date();
  const agenda = { inicioEm: e.inicioEm, duracaoMin: e.duracaoMin };
  const encerrado = fimDoEvento(agenda) <= agora;
  const selo = e.situacao === "PUBLICADO" && encerrado ? { tom: "neutro" as const, texto: "Encerrado" } : SELO[e.situacao];
  const curso = opcoes.cursos.find((c) => c.id === e.produtoId)?.titulo ?? null;
  const detalhes = [
    e.publicadoEm && `Publicado em ${dataHoraCurta(e.publicadoEm)}`,
    e.canceladoEm && `Cancelado em ${dataHoraCurta(e.canceladoEm)}`,
    e.situacao === "PUBLICADO" && momentoDoEvento(agenda, agora) === "ABERTO" && "Link liberado para o público agora",
  ].filter((d): d is string => !!d);

  return (
    <>
      <CabecalhoPagina
        variante="admin"
        titulo={e.titulo}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <Selo tom={selo.tom}>{selo.texto}</Selo>
            {dataHoraCurta(e.inicioEm)} · {duracaoTexto(e.duracaoMin)}
          </span>
        }
        acoes={
          e.situacao !== "RASCUNHO" && (
            <Link href={`${ROTA_EVENTOS}/${e.id}`} target="_blank" className={buttonVariants({ variant: "contorno", size: "36" })}>
              Ver como aluno
            </Link>
          )
        }
      />
      <div className="grid items-start gap-5 desk:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Cartao padding={24} como="section" aria-label="Dados do encontro">
            <CartaoTitulo tamanho={15} como="h2" className="mb-4">
              Dados
            </CartaoTitulo>
            <FormEvento
              key={e.versao}
              evento={{
                id: e.id,
                versao: e.versao,
                campos: {
                  titulo: e.titulo,
                  descricao: e.descricao,
                  inicio: campoDeBrasilia(e.inicioEm),
                  duracaoMin: e.duracaoMin,
                  link: e.link ?? "",
                  publico: e.publico,
                  produtoId: e.produtoId,
                  grupoIds: e.grupoIds,
                  gravacaoAulaId: e.gravacaoAulaId,
                },
              }}
              opcoes={opcoes}
              somenteLeitura={e.situacao === "CANCELADO"}
            />
          </Cartao>
          {e.situacao !== "RASCUNHO" && (
            <Cartao padding={24} como="section" id="confirmados" aria-labelledby="titulo-confirmados" className="scroll-mt-24">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <CartaoTitulo tamanho={15} como="h2" id="titulo-confirmados">
                  Confirmados
                </CartaoTitulo>
                <span className="text-[13px] text-muted">{inscritos.length === 1 ? "1 pessoa" : `${inscritos.length} pessoas`}</span>
              </div>
              {inscritos.length === 0 ? (
                <EstadoVazio icone={<Users />} titulo="Ninguém confirmou presença ainda" descricao="Quem tocar em “Vou participar” na página do encontro aparece aqui." className="py-6" />
              ) : (
                <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
                  {inscritos.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 py-2.5">
                      <Avatar nome={i.nome} tamanho={36} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{i.nome}</div>
                        <div className="truncate text-xs text-muted">{i.email}</div>
                      </div>
                      <span className="shrink-0 text-right text-xs text-muted">
                        <span className="sr-only">Confirmou em </span>
                        {dataHoraCurta(i.confirmadoEm)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          )}
        </div>
        <aside className="flex min-w-0 flex-col gap-5">
          <Cartao padding={20} como="section" aria-label="Situação do evento">
            <SituacaoEvento
              key={e.versao}
              temLink={!!e.link}
              detalhes={detalhes}
              evento={{
                id: e.id,
                titulo: e.titulo,
                situacao: e.situacao,
                quando: quandoDoEvento(e.inicioEm),
                publico: textoDoPublico(e.publico, curso, e.grupoIds.length),
                inscritos: inscritos.length,
                encerrado,
                versao: e.versao,
              }}
            />
          </Cartao>
        </aside>
      </div>
    </>
  );
}

/** Editor do evento do criador do HOST (DONO e ADMIN): dados, situação e quem confirmou. */
export default function PaginaEvento({ params }: { params: Params }) {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/eventos" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Eventos ao vivo
      </Link>
      <Suspense fallback={null}>
        <Editor params={params} />
      </Suspense>
    </div>
  );
}
