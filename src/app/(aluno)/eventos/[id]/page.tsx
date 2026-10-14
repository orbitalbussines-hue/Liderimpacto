import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CalendarPlus, ExternalLink, PlayCircle } from "lucide-react";
import { TextoComLinks } from "@/components/comunidade/texto-com-links";
import { BlocoData } from "@/components/engajamento/bloco-data";
import { Aviso } from "@/components/ui/aviso";
import { buttonVariants } from "@/components/ui/button";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { Esqueleto } from "@/components/ui/esqueleto";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { eventoDoMembro } from "@/lib/eventos/consultas";
import { LINK_ABRE_ANTES_MIN, ROTA_EVENTOS } from "@/lib/eventos/regras";
import { diaEMes, duracaoTexto, horaDoEvento, quandoPorExtenso, textoConfirmados } from "@/lib/eventos/tela";
import { idSchema } from "@/lib/validators/eventos";
import { BotaoPresenca } from "../_components/botao-presenca";
import { ContagemEvento } from "../_components/contagem-evento";

export const metadata: Metadata = { title: "Encontro ao vivo" };

type Params = Promise<{ id: string }>;

async function Detalhe({ params }: { params: Params }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const q = await membroDaPagina(TODOS_OS_MEMBROS);
  const e = await eventoDoMembro(q, id, new Date());
  if (!e) notFound();
  const { dia, mes } = diaEMes(e.inicioEm);
  const cancelado = e.situacao === "CANCELADO";
  const encerrado = e.momento === "ENCERRADO";
  const ativo = !cancelado && !encerrado;

  return (
    <div className="grid items-start gap-5 desk:grid-cols-[minmax(0,1fr)_320px]">
      <Cartao padding={24} raio={18} como="article" aria-labelledby="titulo-evento" className="flex min-w-0 flex-col gap-5">
        <div className="flex items-start gap-4">
          <BlocoData dia={dia} mes={mes} tamanho="grande" apagado={!ativo} />
          <div className="flex min-w-0 flex-col gap-1">
            {cancelado ? (
              <span className="text-[13px] font-bold text-warn">Cancelado</span>
            ) : (
              <ContagemEvento inicioEm={e.inicioEm.toISOString()} fimEm={e.fimEm.toISOString()} className="text-[13px] font-bold text-accent" />
            )}
            <h1 id="titulo-evento" className="m-0 text-[26px] leading-tight desk:text-[32px]">
              {e.titulo}
            </h1>
            <p className="m-0 text-sm text-muted">
              {quandoPorExtenso(e.inicioEm)} até {horaDoEvento(e.fimEm)} · {duracaoTexto(e.duracaoMin)}
            </p>
          </div>
        </div>
        {cancelado && <Aviso tom="info">Este encontro foi cancelado pela equipe.</Aviso>}
        {e.descricao ? <TextoComLinks texto={e.descricao} className="text-[15px] leading-relaxed" /> : <p className="m-0 text-sm text-muted">Sem descrição.</p>}
      </Cartao>

      <aside className="flex min-w-0 flex-col gap-4">
        <Cartao padding={20} como="section" aria-labelledby="titulo-participar" className="flex flex-col gap-3">
          <CartaoTitulo como="h2" id="titulo-participar">
            {encerrado ? "Encontro encerrado" : "Participar"}
          </CartaoTitulo>
          {e.link && (
            <a href={e.link} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "46", pilula: true, larguraTotal: true })}>
              Entrar no encontro
              <ExternalLink aria-hidden />
            </a>
          )}
          {ativo && !e.link && <p className="m-0 text-[13px] leading-relaxed text-muted">O botão para entrar na sala aparece aqui {LINK_ABRE_ANTES_MIN} minutos antes do início.</p>}
          {ativo && <BotaoPresenca eventoId={e.id} inscrito={e.inscrito} secundario={!!e.link} />}
          {ativo && (
            <a href={`${ROTA_EVENTOS}/${e.id}/agenda.ics`} download className={buttonVariants({ variant: "contorno", size: "40", larguraTotal: true })}>
              <CalendarPlus aria-hidden />
              Adicionar à agenda
            </a>
          )}
          {encerrado &&
            (e.gravacaoAulaId ? (
              <Link href={`/aula/${e.gravacaoAulaId}`} className={buttonVariants({ size: "46", pilula: true, larguraTotal: true })}>
                <PlayCircle aria-hidden />
                Assistir gravação
              </Link>
            ) : (
              <p className="m-0 text-[13px] text-muted">{cancelado ? "Sem gravação." : "A gravação, quando houver, aparece aqui."}</p>
            ))}
          {!cancelado && <p className="m-0 border-t border-border pt-3 text-[13px] text-muted">{textoConfirmados(e.inscritos)}</p>}
        </Cartao>
      </aside>
    </div>
  );
}

const esqueleto = (
  <div aria-busy className="grid items-start gap-5 desk:grid-cols-[minmax(0,1fr)_320px]">
    <span className="sr-only">Carregando o encontro</span>
    <Esqueleto className="h-[260px] rounded-[18px]" />
    <Esqueleto className="h-[220px] rounded-2xl" />
  </div>
);

/** Detalhe do encontro (RN-142/143): quando, descrição, presença, agenda e o link só na janela. */
export default function PaginaEvento({ params }: { params: Params }) {
  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-4">
      <Link href={ROTA_EVENTOS} className="inline-flex min-h-11 items-center gap-1 self-start text-[13px] font-semibold text-muted hover:text-text">
        <ArrowLeft aria-hidden className="size-4" />
        Encontros ao vivo
      </Link>
      <Suspense fallback={esqueleto}>
        <Detalhe params={params} />
      </Suspense>
    </div>
  );
}
