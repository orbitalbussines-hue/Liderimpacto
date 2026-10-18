"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Award, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { FaixaCapitulos } from "@/components/curso/faixa-capitulos";
import { capituloEm, type CapituloPlayer } from "@/components/player/barra-tempo";
import { PlayerAula, type AulaVizinhaPlayer, type ControlePlayer } from "@/components/player/player-aula";
import type { LegendaPlayer } from "@/components/player/use-legenda";
import { Abas } from "@/components/ui/abas";
import { Aviso } from "@/components/ui/aviso";
import { Button, buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Selo } from "@/components/ui/selo";
import { acaoConcluirAula } from "@/lib/actions/progresso";
import { cn } from "@/lib/utils";
import { formatarTempo } from "@/lib/validators/catalogo";
import { AnotacoesAula, type Anotacao } from "./anotacoes-aula";
import { MateriaisAula, type MaterialAula } from "./materiais-aula";
import { TranscricaoAula } from "./transcricao-aula";

export interface AulaInterativaProps {
  aula: { id: string; numero: string; titulo: string; descricao: string | null; duracaoSeg: number | null; capitulos: CapituloPlayer[] };
  eyebrow: string;
  /** Player montável (pode + vídeo PRONTO); senão `quadro` ocupa o lugar do vídeo. */
  player: { poster: string | null; marcaDagua: string; retomarEm: number; autoIniciar: boolean } | null;
  quadro?: ReactNode;
  flags: {
    abas: { descricao: boolean; materiais: boolean; comentarios: boolean; anotacoes: boolean };
    autoplay: boolean;
    contagemAutoplaySeg: number;
    velocidade: boolean;
    marcadores: boolean;
    /** Aviso "Faltam N aulas para o seu certificado" (construtor da vitrine, aba Player); null = sem aviso. */
    aulasParaCertificado?: number | null;
  };
  concluida: boolean;
  concluirManual: boolean;
  podeAnotar: boolean;
  anterior: AulaVizinhaPlayer | null;
  proxima: AulaVizinhaPlayer | null;
  materiais: MaterialAula[];
  anotacoes: Anotacao[];
  /** Painel da aba Comentários (montado no servidor com `comentariosDaAula`). */
  comentarios?: ReactNode;
  /** `?aba=comentarios` (link das notificações): abre direto nesta aba. */
  abaInicial?: string;
  /** Legendas (só com o player montável): `<track>` + CC e a aba Transcrição (a primeira). */
  legendas?: LegendaPlayer[];
  /** Chave do `localStorage` da escolha de legenda (por pessoa). */
  chaveLegenda?: string;
  /** Painel "Pergunte ao professor" (ADR-0014), montado no servidor só quando o assistente aparece. */
  assistente?: ReactNode;
  /** `?t=` da URL: ao mudar (fonte citada pelo assistente na mesma aula), o vídeo pula para lá. */
  saltoSeg?: number | null;
  /** "Esta aula foi útil?" (RN-202), montado no servidor só para quem pode assistir. */
  feedback?: ReactNode;
}

type Aba = "descricao" | "transcricao" | "assistente" | "materiais" | "comentarios" | "anotacoes";

/**
 * Coluna principal da aula (client): player, cabeçalho com Anterior / Concluir e avançar, faixa
 * de capítulos (clicável), abas. O tempo do vídeo sobe do player 1x/s para o capítulo atual e o
 * "Anotar em 12:34". Conclusão pelos 90% chega na resposta da batida; aí a playlist (servidor) é
 * recarregada com `router.refresh()`.
 */
export function AulaInterativa(p: AulaInterativaProps) {
  const router = useRouter();
  const player = useRef<ControlePlayer>(null);
  const [tempo, setTempo] = useState(p.player?.retomarEm ?? 0);
  const [concluida, setConcluida] = useState(p.concluida);
  const [anuncio, setAnuncio] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const transcricao = p.player ? p.legendas?.[0] : undefined;
  const abas = (
    [
      p.flags.abas.descricao && { valor: "descricao", rotulo: "Descrição" },
      transcricao && { valor: "transcricao", rotulo: "Transcrição" },
      p.assistente && { valor: "assistente", rotulo: "Pergunte ao professor" },
      p.flags.abas.materiais && { valor: "materiais", rotulo: p.materiais.length ? `Materiais (${p.materiais.length})` : "Materiais" },
      p.flags.abas.comentarios && { valor: "comentarios", rotulo: "Comentários" },
      p.flags.abas.anotacoes && p.podeAnotar && { valor: "anotacoes", rotulo: "Anotações" },
    ] as const
  ).filter((a): a is { valor: Aba; rotulo: string } => !!a);
  const [aba, setAba] = useState<Aba>(abas.find((a) => a.valor === p.abaInicial)?.valor ?? abas[0]?.valor ?? "descricao");
  const abasRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (p.abaInicial === "comentarios") abasRef.current?.scrollIntoView({ block: "start" });
  }, [p.abaInicial]);
  // O primeiro valor já entrou como `retomarEm`; só as mudanças seguintes pulam o vídeo.
  const saltoAnterior = useRef(p.saltoSeg);
  useEffect(() => {
    if (p.saltoSeg == null || p.saltoSeg === saltoAnterior.current) return;
    saltoAnterior.current = p.saltoSeg;
    player.current?.irPara(p.saltoSeg);
    document.getElementById("player-aula")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [p.saltoSeg]);

  const concluirEAvancar = () =>
    iniciar(async () => {
      setErro(null);
      if (!concluida) {
        const r = await acaoConcluirAula({ aulaId: p.aula.id });
        if (!r.ok) return setErro(r.erro);
        setConcluida(true);
      }
      if (p.proxima) router.push(p.proxima.href);
      else {
        setAnuncio("Aula concluída. Esta é a última aula disponível do curso.");
        router.refresh();
      }
    });

  const capitulos = p.flags.marcadores ? p.aula.capitulos : [];
  const capAtual = capituloEm(p.aula.capitulos, tempo);
  const irPara = (seg: number) => {
    player.current?.irPara(seg);
    document.getElementById("player-aula")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const rotuloConcluir = concluida ? (p.proxima ? "Próxima aula" : "Aula concluída") : "Concluir e avançar";
  const mostrarConcluir = concluida || p.concluirManual;
  // Um botão só não estica até 480 px no desktop (fica com cara de faixa).
  const umSo = [!!p.anterior, mostrarConcluir || !!p.proxima].filter(Boolean).length === 1;

  return (
    <div className="flex min-w-0 flex-col gap-[18px]">
      <div id="player-aula" className="scroll-mt-24">
        {p.player ? (
          <PlayerAula
            ref={player}
            aulaId={p.aula.id}
            titulo={p.aula.titulo}
            duracaoSeg={p.aula.duracaoSeg}
            poster={p.player.poster}
            marcaDagua={p.player.marcaDagua}
            retomarEm={p.player.retomarEm}
            capitulos={capitulos}
            velocidade={p.flags.velocidade}
            autoplay={p.flags.autoplay}
            contagemSeg={p.flags.contagemAutoplaySeg}
            anterior={p.anterior}
            proxima={p.proxima}
            autoIniciar={p.player.autoIniciar}
            legendas={p.legendas}
            chaveLegenda={p.chaveLegenda}
            onTempo={setTempo}
            onGravado={(g) => {
              if (g.concluida && !concluida) {
                setConcluida(true);
                setAnuncio("Aula concluída.");
              }
              if (g.concluiuAgora) router.refresh();
            }}
          />
        ) : (
          p.quadro
        )}
      </div>

      <CabecalhoPagina
        variante="aula"
        eyebrow={p.eyebrow}
        titulo={p.aula.titulo}
        meta={
          concluida ? (
            <Selo tom="ok">
              <Check aria-hidden className="size-3" />
              Concluída
            </Selo>
          ) : undefined
        }
      />
      <p className="sr-only" role="status">
        {anuncio}
      </p>

      {(p.anterior || mostrarConcluir || p.proxima) && (
        <div className={cn("flex w-full max-w-[480px] flex-wrap gap-2.5", umSo && "desk:max-w-[240px]")}>
          {p.anterior && (
            <Link href={p.anterior.href} className={buttonVariants({ variant: "secundario", size: "46", className: "min-w-[140px] flex-[1_1_140px]" })}>
              <ChevronLeft aria-hidden className="size-3.5" />
              Anterior
            </Link>
          )}
          {mostrarConcluir ? (
            <Button
              type="button"
              size="46"
              className="min-w-[180px] flex-[1_1_180px]"
              carregando={pendente}
              disabled={concluida && !p.proxima}
              onClick={concluirEAvancar}
            >
              {!(concluida && p.proxima) && <Check aria-hidden className="size-3.5" />}
              {rotuloConcluir}
              {concluida && p.proxima && <ChevronRight aria-hidden className="size-3.5" />}
            </Button>
          ) : (
            p.proxima && (
              <Link href={p.proxima.href} className={buttonVariants({ variant: "primario", size: "46", className: "min-w-[180px] flex-[1_1_180px]" })}>
                Próxima aula
                <ChevronRight aria-hidden className="size-3.5" />
              </Link>
            )
          )}
        </div>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {p.feedback}
      {!!p.flags.aulasParaCertificado && (
        <p className="m-0 flex items-center gap-2 self-start rounded-[10px] bg-accent-soft px-3.5 py-2.5 text-[13px] font-bold text-accent">
          <Award aria-hidden className="size-4 shrink-0" />
          Faltam {p.flags.aulasParaCertificado} {p.flags.aulasParaCertificado === 1 ? "aula" : "aulas"} para o seu certificado
        </p>
      )}

      {p.aula.capitulos.length > 0 && (
        <FaixaCapitulos
          capitulos={p.aula.capitulos.map((c, i) => ({ titulo: c.titulo, tempo: formatarTempo(c.inicioSeg), atual: i === capAtual }))}
          onSelecionar={p.player ? (i) => irPara(p.aula.capitulos[i].inicioSeg) : undefined}
        />
      )}

      {abas.length > 0 && (
        <div ref={abasRef} className="flex scroll-mt-24 flex-col gap-4">
          <Abas itens={abas.map((a) => ({ ...a, idPainel: `painel-${a.valor}` }))} ativo={aba} onSelecionar={(v) => setAba(v as Aba)} aria-label="Conteúdo da aula" />
          {/* Painéis montados o tempo todo (só escondidos): anotação em edição não se perde ao trocar de aba. */}
          <div id="painel-descricao" role="tabpanel" aria-label="Descrição" hidden={aba !== "descricao"} className="flex max-w-[760px] flex-col gap-3.5 text-[15px] leading-[1.65]">
            {p.aula.descricao ? <p className="m-0 whitespace-pre-line">{p.aula.descricao}</p> : <p className="m-0 text-muted">Esta aula não tem descrição.</p>}
            {p.flags.abas.materiais && p.materiais.length > 0 && <MateriaisAula materiais={p.materiais} />}
          </div>
          {transcricao && (
            <div id="painel-transcricao" role="tabpanel" aria-label="Transcrição" hidden={aba !== "transcricao"}>
              <TranscricaoAula url={transcricao.url} ativa={aba === "transcricao"} tempo={tempo} onIrPara={irPara} />
            </div>
          )}
          {p.assistente && (
            <div id="painel-assistente" role="tabpanel" aria-label="Pergunte ao professor" hidden={aba !== "assistente"} className="max-w-[760px]">
              {p.assistente}
            </div>
          )}
          <div id="painel-materiais" role="tabpanel" aria-label="Materiais" hidden={aba !== "materiais"}>
            {p.materiais.length ? <MateriaisAula materiais={p.materiais} /> : <EstadoVazio comMoldura titulo="Sem materiais nesta aula" descricao="Quando a equipe anexar PDFs, documentos ou links, eles aparecem aqui." />}
          </div>
          {abas.some((a) => a.valor === "comentarios") && (
            <div id="painel-comentarios" role="tabpanel" aria-label="Comentários" hidden={aba !== "comentarios"} className="max-w-[760px]">
              {p.comentarios ?? <EstadoVazio comMoldura titulo="Comentários indisponíveis" descricao="Os comentários desta aula aparecem para quem pode assisti-la." />}
            </div>
          )}
          {abas.some((a) => a.valor === "anotacoes") && (
            <div id="painel-anotacoes" role="tabpanel" aria-label="Anotações" hidden={aba !== "anotacoes"}>
              <AnotacoesAula aulaId={p.aula.id} iniciais={p.anotacoes} tempoAtual={tempo} capturarTempo={() => player.current?.tempoAtual() ?? tempo} onIrPara={irPara} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
