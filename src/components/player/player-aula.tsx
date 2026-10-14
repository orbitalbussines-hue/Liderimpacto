"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore, type Ref } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MonitorX, Play, RotateCcw } from "lucide-react";
import { MarcaDagua } from "@/components/video/marca-dagua";
import { useHls, type ErroHls } from "@/components/video/use-hls";
import { acaoIniciarReproducao, acaoRenovarReproducao } from "@/lib/actions/videos";
import { cn } from "@/lib/utils";
import type { Reproducao } from "@/lib/video/provedor";
import { acaoDoAtalho, atalhoValeNoAlvo, type AcaoAtalho } from "./atalhos";
import type { CapituloPlayer } from "./barra-tempo";
import { ControlesPlayer, type MenuAberto } from "./controles-player";
import { FimDaAula } from "./fim-da-aula";
import { LegendaNaTela } from "./legenda-na-tela";
import { gravarPreferenciaLegenda, idDaFaixa, lerPreferenciaLegenda, useLegenda, type LegendaPlayer } from "./use-legenda";
import { useProgresso, type ProgressoDaBatida } from "./use-progresso";

export interface AulaVizinhaPlayer {
  id: string;
  numero: string;
  titulo: string;
  href: string;
}

/** O que a página faz com o player (anotação no tempo atual, pular para o capítulo). */
export interface ControlePlayer {
  tempoAtual: () => number;
  irPara: (seg: number) => void;
}

export interface PlayerAulaProps {
  aulaId: string;
  titulo: string;
  /** Duração gravada pelo worker (a do contrato da batida). */
  duracaoSeg: number | null;
  poster: string | null;
  /** Nome + e-mail de quem assiste. */
  marcaDagua: string;
  retomarEm: number;
  /** Vazio = sem marcadores (`flags.marcadores` desligado). */
  capitulos: readonly CapituloPlayer[];
  /** `flags.velocidade`. */
  velocidade: boolean;
  /** `flags.autoplay` (preferência) e `flags.contagemAutoplaySeg`. */
  autoplay: boolean;
  contagemSeg: number;
  anterior: AulaVizinhaPlayer | null;
  proxima: AulaVizinhaPlayer | null;
  /** Veio da reprodução automática da aula anterior: já abre tocando. */
  autoIniciar?: boolean;
  /** Legendas da aula (RN-180); vazio = sem legenda. */
  legendas?: readonly LegendaPlayer[];
  /** Chave do `localStorage` da escolha (por pessoa): ligada/desligada e o idioma. */
  chaveLegenda?: string;
  /** Segundo inteiro atual (muda no máximo 1x/s). */
  onTempo?: (seg: number) => void;
  /** Resposta do servidor a cada batida registrada (conclusão aos 90%). */
  onGravado?: (p: ProgressoDaBatida) => void;
  ref?: Ref<ControlePlayer>;
}

const OCULTAR_CONTROLES_MS = 2500;
const OUTRA_TELA = /outra tela/i;
/** Href da próxima aula aberta pela reprodução automática (ela já começa tocando). */
export const hrefAutoplay = (href: string) => `${href}?auto=1`;

const semInscricao = () => () => {};
const SEM_LEGENDAS: readonly LegendaPlayer[] = [];

type Falha = ErroHls | { tipo: "outraTela"; mensagem: string };

/**
 * Player completo da aula (tela 5): HLS protegido (`useHls`), controles do design, atalhos de
 * teclado, retomada, progresso (`useProgresso`), reprodução automática com contagem, marca d'água
 * e o aviso de "aberto em outra tela" (limite de telas, RN-115). A sessão de reprodução só abre
 * no primeiro play (abrir a página não derruba a outra tela).
 */
export function PlayerAula(props: PlayerAulaProps) {
  const { aulaId, titulo, duracaoSeg, poster, marcaDagua, retomarEm, capitulos, anterior, proxima, onTempo, onGravado, ref } = props;
  const router = useRouter();
  const raiz = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const alvoInicial = useRef<number | null>(retomarEm > 0 ? retomarEm : null);
  const querTocar = useRef(false);
  const segundoInformado = useRef(-1);

  const [reproducao, setReproducao] = useState<Reproducao | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [esperando, setEsperando] = useState(false);
  const [falha, setFalha] = useState<Falha | null>(null);
  const [tocando, setTocando] = useState(false);
  const [terminou, setTerminou] = useState(false);
  const [tempo, setTempo] = useState(retomarEm);
  const [duracao, setDuracao] = useState(duracaoSeg ?? 0);
  const [carregado, setCarregado] = useState(0);
  const [volume, setVolume] = useState(1);
  const [mudo, setMudo] = useState(false);
  const [taxa, setTaxa] = useState(1);
  const [menu, setMenu] = useState<MenuAberto>(null);
  const [telaCheia, setTelaCheia] = useState(false);
  const pip = useSyncExternalStore(semInscricao, () => document.pictureInPictureEnabled === true, () => false);
  const [ativo, setAtivo] = useState(true);
  const timerAtivo = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const renovar = useCallback(async () => {
    if (!reproducao) return { ok: false as const, erro: "Sem reprodução aberta." };
    return acaoRenovarReproducao({ aulaId, videoId: reproducao.videoId, sessaoId: reproducao.sessaoId });
  }, [aulaId, reproducao]);

  const aoErroHls = useCallback(
    async (e: ErroHls) => {
      if (e.tipo !== "acesso") return setFalha(e);
      // 403 na chave/playlist: a renovação diz se foi o limite de telas ou outra recusa.
      const r = OUTRA_TELA.test(e.mensagem) ? ({ ok: false, erro: e.mensagem } as const) : await renovar();
      if (r.ok) return setFalha({ tipo: "rede", mensagem: "A reprodução foi interrompida." });
      setFalha(OUTRA_TELA.test(r.erro) ? { tipo: "outraTela", mensagem: "Este vídeo foi aberto em outra tela." } : { tipo: "acesso", mensagem: r.erro });
    },
    [renovar],
  );

  // Falha ou tela perdida: o que já estava no buffer não segue tocando por trás do aviso.
  useEffect(() => {
    if (falha) video.current?.pause();
  }, [falha]);

  const { niveis, nivel, escolherNivel } = useHls(video, reproducao, renovar, (e) => void aoErroHls(e));

  // Legenda: a escolha desta página vence a lembrada no navegador ("" = desligada).
  const legendas = props.legendas ?? SEM_LEGENDAS;
  const chaveLegenda = props.chaveLegenda ?? "legenda";
  const lembrada = useSyncExternalStore(semInscricao, () => lerPreferenciaLegenda(chaveLegenda), () => null);
  const [idiomaEscolhido, setIdiomaEscolhido] = useState<string | null>(null);
  const idioma = idiomaEscolhido ?? lembrada ?? "";
  const legendaAtiva = idioma ? (legendas.find((l) => l.idioma === idioma) ?? legendas[0] ?? null) : null;
  const textoLegenda = useLegenda(video, legendaAtiva?.id ?? null);
  const escolherLegenda = useCallback(
    (id: string | null) => {
      const novo = id ? (legendas.find((l) => l.id === id)?.idioma ?? "") : "";
      setIdiomaEscolhido(novo);
      gravarPreferenciaLegenda(chaveLegenda, novo);
    },
    [chaveLegenda, legendas],
  );
  useProgresso(video, { aulaId, duracaoSeg, ativo: !!reproducao, aoGravar: (p) => onGravado?.(p) });

  /** Abre a sessão de reprodução (token + limite de telas) e liga o HLS; o play sai no `loadedmetadata`. */
  const abrirSessao = useCallback(async () => {
    querTocar.current = true;
    setAbrindo(true);
    setFalha(null);
    const r = await acaoIniciarReproducao({ aulaId }).catch(() => null);
    setAbrindo(false);
    if (!r) return setFalha({ tipo: "rede", mensagem: "Sem conexão com o servidor." });
    if (!r.ok) return setFalha({ tipo: "acesso", mensagem: r.erro });
    setReproducao(r.dados);
  }, [aulaId]);

  const iniciar = useCallback(async () => {
    if (!reproducao) return abrirSessao();
    querTocar.current = true;
    await video.current?.play().catch(() => setTocando(false));
  }, [abrirSessao, reproducao]);

  /** Depois de falha ou de perder a tela: sessão nova, do ponto onde estava. */
  const tentarDeNovo = () => {
    const el = video.current;
    if (el && el.currentTime > 0) alvoInicial.current = el.currentTime;
    setReproducao(null);
    void abrirSessao();
  };

  const autoIniciar = props.autoIniciar;
  useEffect(() => {
    if (!autoIniciar) return;
    // Só na montagem (a aula seguinte é outra página); fora do ciclo do efeito.
    const t = setTimeout(() => void iniciar(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma vez por aula aberta
  }, []);

  const irPara = useCallback(
    (seg: number) => {
      const el = video.current;
      if (!reproducao || !el || el.readyState < 1) {
        alvoInicial.current = seg;
        setTempo(seg);
        void iniciar();
        return;
      }
      el.currentTime = Math.min(Math.max(0, seg), el.duration || seg);
    },
    [iniciar, reproducao],
  );

  useImperativeHandle(ref, () => ({ tempoAtual: () => video.current?.currentTime ?? tempo, irPara }), [irPara, tempo]);

  const alternar = useCallback(() => {
    const el = video.current;
    if (!reproducao || !el) return void iniciar();
    if (el.paused || el.ended) void el.play().catch(() => {});
    else el.pause();
  }, [iniciar, reproducao]);

  const alternarTelaCheia = useCallback(() => {
    const el = raiz.current;
    const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) return void document.exitFullscreen().catch(() => {});
    if (el?.requestFullscreen) return void el.requestFullscreen().catch(() => v?.webkitEnterFullscreen?.());
    v?.webkitEnterFullscreen?.(); // iPhone: só o <video> entra em tela cheia (nativa).
  }, []);

  const executarAtalho = useCallback(
    (a: AcaoAtalho) => {
      const el = video.current;
      if (a.tipo === "alternar") return alternar();
      if (a.tipo === "telaCheia") return alternarTelaCheia();
      if (a.tipo === "legendas") return legendas.length ? escolherLegenda(legendaAtiva ? null : legendas[0].id) : undefined;
      if (!el) return;
      if (a.tipo === "mudo") el.muted = !el.muted;
      else if (a.tipo === "volume") {
        el.muted = false;
        el.volume = Math.min(1, Math.max(0, Math.round((el.volume + a.delta) * 100) / 100));
      } else if (a.tipo === "pular") irPara(el.currentTime + a.seg);
      else if (a.tipo === "porcentagem" && duracao > 0) irPara((duracao * a.valor) / 100);
    },
    [alternar, alternarTelaCheia, duracao, irPara, legendas, legendaAtiva, escolherLegenda],
  );

  const mostrarControles = useCallback(() => {
    setAtivo(true);
    clearTimeout(timerAtivo.current);
    timerAtivo.current = setTimeout(() => setAtivo(false), OCULTAR_CONTROLES_MS);
  }, []);
  useEffect(() => () => clearTimeout(timerAtivo.current), []);

  useEffect(() => {
    const aoMudar = () => setTelaCheia(document.fullscreenElement === raiz.current);
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

  const contagemAtiva = terminou && props.autoplay && !!proxima;
  const irParaProxima = useCallback(() => {
    if (proxima) router.push(hrefAutoplay(proxima.href));
  }, [proxima, router]);

  const informarTempo = (t: number) => {
    setTempo(t);
    const s = Math.floor(t);
    if (s !== segundoInformado.current) {
      segundoInformado.current = s;
      onTempo?.(s);
    }
  };

  const controlesVisiveis = !reproducao || !tocando || ativo || menu !== null || terminou;
  const semInicio = !reproducao && !abrindo && !falha;

  return (
    <div
      ref={raiz}
      data-theme="dark"
      role="region"
      aria-label={`Player: ${titulo}`}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (falha || !atalhoValeNoAlvo(e.target, e.key)) return;
        const a = acaoDoAtalho(e);
        if (!a) return;
        e.preventDefault();
        mostrarControles();
        executarAtalho(a);
      }}
      onPointerMove={mostrarControles}
      onFocusCapture={mostrarControles}
      className={cn(
        "group/player @container relative aspect-video w-full overflow-hidden rounded-2xl bg-black text-white outline-none select-none focus-visible:ring-2 focus-visible:ring-fixo-accent/45",
        "[&:fullscreen]:rounded-none",
        !controlesVisiveis && "cursor-none",
      )}
    >
      <video
        ref={video}
        className="absolute inset-0 size-full bg-black object-contain"
        playsInline
        // Sem sessão não baixa nada; com ela, metadata (o Safari só dispara loadedmetadata com preload).
        preload={reproducao ? "auto" : "none"}
        poster={poster ?? undefined}
        aria-label={titulo}
        controlsList="nodownload"
        disablePictureInPicture={!pip}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          raiz.current?.focus({ preventScroll: true });
          alternar();
        }}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          setDuracao(Number.isFinite(el.duration) ? el.duration : (duracaoSeg ?? 0));
          if (alvoInicial.current !== null) {
            el.currentTime = alvoInicial.current;
            alvoInicial.current = null;
          }
          if (querTocar.current) void el.play().catch(() => setTocando(false));
        }}
        onTimeUpdate={(e) => informarTempo(e.currentTarget.currentTime)}
        onSeeked={(e) => informarTempo(e.currentTarget.currentTime)}
        onProgress={(e) => {
          const b = e.currentTarget.buffered;
          setCarregado(b.length ? b.end(b.length - 1) : 0);
        }}
        onPlay={() => {
          setTocando(true);
          setTerminou(false);
          mostrarControles();
        }}
        onPause={() => setTocando(false)}
        onWaiting={() => setEsperando(true)}
        onPlaying={() => setEsperando(false)}
        onCanPlay={() => setEsperando(false)}
        onEnded={() => {
          setTocando(false);
          setTerminou(true);
        }}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMudo(e.currentTarget.muted);
        }}
        onRateChange={(e) => setTaxa(e.currentTarget.playbackRate)}
      >
        {/* Mesma origem (rota do app, com o cookie). Quem liga e desenha é o `useLegenda`. */}
        {legendas.map((l) => (
          <track key={l.id} id={idDaFaixa(l.id)} kind="subtitles" src={l.url} srcLang={l.idioma} label={l.rotulo} />
        ))}
      </video>

      <MarcaDagua texto={marcaDagua} />
      <LegendaNaTela texto={falha ? "" : textoLegenda} elevada={!!reproducao && (!tocando || ativo || menu !== null)} />

      {(abrindo || (esperando && tocando)) && !falha && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center" role="status">
          <Loader2 aria-hidden className="size-10 animate-spin text-white/85 motion-reduce:animate-none" />
          <span className="sr-only">Carregando o vídeo…</span>
        </div>
      )}

      {(semInicio || (reproducao && !tocando && (!terminou || !proxima) && !esperando && !falha)) && (
        <button
          type="button"
          onClick={() => {
            raiz.current?.focus({ preventScroll: true });
            alternar();
          }}
          aria-label={semInicio && retomarEm > 0 ? `Continuar de onde parou` : "Reproduzir"}
          className={cn(
            "absolute top-1/2 left-1/2 z-10 grid size-[68px] -translate-x-1/2 max-desk:size-14 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-fixo-accent/95 text-fixo-accent-ink shadow-card transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white active:scale-[.98] motion-reduce:transition-none",
            // Celular com a barra visível: sobe para o espaço livre acima dela.
            reproducao && "max-desk:top-[27%]",
          )}
        >
          <Play aria-hidden className="ml-1 size-[26px] fill-current" />
        </button>
      )}

      {falha && (
        <div role="alert" className="absolute inset-0 z-20 grid place-items-center bg-black/80 p-6 text-center">
          <div className="flex max-w-sm flex-col items-center gap-3">
            {falha.tipo === "outraTela" ? <MonitorX aria-hidden className="size-9 text-fixo-accent" /> : <RotateCcw aria-hidden className="size-8 text-white/70" />}
            <p className="m-0 text-[15px] font-bold">{falha.tipo === "outraTela" ? falha.mensagem : "Não foi possível reproduzir o vídeo"}</p>
            <p className="m-0 text-[13px] leading-relaxed text-white/70">
              {falha.tipo === "outraTela" ? "Sua conta assiste em poucas telas ao mesmo tempo. Continue aqui para encerrar a outra." : falha.mensagem}
            </p>
            {falha.tipo !== "navegador" && (
              <button
                type="button"
                onClick={tentarDeNovo}
                className="mt-1 inline-flex h-11 cursor-pointer items-center gap-2 rounded-[9px] bg-fixo-accent px-5 text-[13px] font-bold text-fixo-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <RotateCcw aria-hidden className="size-4" />
                {falha.tipo === "outraTela" ? "Assistir nesta tela" : "Tentar novamente"}
              </button>
            )}
          </div>
        </div>
      )}

      {terminou && proxima && !falha && (
        <FimDaAula
          proxima={proxima}
          contagem={contagemAtiva ? props.contagemSeg : null}
          onIr={irParaProxima}
          onRever={() => irPara(0)}
        />
      )}

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-10 bg-gradient-to-b from-transparent to-black/80 transition-opacity duration-200 motion-reduce:transition-none",
          controlesVisiveis ? "opacity-100" : "pointer-events-none opacity-0",
          // Celular, antes do primeiro play: só o botão central (o vídeo é baixo demais para os dois).
          !reproducao && "max-desk:hidden",
        )}
        // Toque com os controles escondidos só os mostra (não pausa por engano).
        onPointerDownCapture={(e) => {
          if (!controlesVisiveis && e.pointerType === "touch") {
            e.stopPropagation();
            mostrarControles();
          }
        }}
      >
        <ControlesPlayer
          tocando={tocando}
          tempo={tempo}
          duracao={duracao}
          carregado={carregado}
          capitulos={capitulos}
          volume={volume}
          mudo={mudo}
          velocidade={props.velocidade ? taxa : null}
          niveis={niveis}
          nivel={nivel}
          telaCheia={telaCheia}
          pip={pip && !!reproducao}
          anterior={anterior}
          proxima={proxima}
          menu={menu}
          onMenu={setMenu}
          legendas={legendas}
          legendaAtiva={legendaAtiva?.id ?? null}
          onLegenda={escolherLegenda}
          onAlternar={alternar}
          onBuscar={irPara}
          onVolume={(v) => {
            if (!video.current) return;
            video.current.volume = v;
            video.current.muted = v === 0;
          }}
          onMudo={() => executarAtalho({ tipo: "mudo" })}
          onVelocidade={(v) => {
            if (video.current) video.current.playbackRate = v;
            setTaxa(v);
          }}
          onNivel={escolherNivel}
          onTelaCheia={alternarTelaCheia}
          onPip={() => {
            const v = video.current;
            if (!v) return;
            void (document.pictureInPictureElement ? document.exitPictureInPicture() : v.requestPictureInPicture()).catch(() => {});
          }}
          onAnterior={() => anterior && router.push(anterior.href)}
          onProxima={() => proxima && router.push(hrefAutoplay(proxima.href))}
        />
      </div>
    </div>
  );
}
