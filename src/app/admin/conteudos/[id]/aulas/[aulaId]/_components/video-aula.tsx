"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { Library, Play, RefreshCw, Upload, Video, X } from "lucide-react";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { Button } from "@/components/ui/button";
import { CartaoTitulo } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import type { OpcaoSelecao } from "@/components/ui/selecao";
import { Selo } from "@/components/ui/selo";
import { PlayerHls } from "@/components/video/player-hls";
import { acaoIniciarReproducao, acaoRenovarReproducao, acaoReprocessarVideo } from "@/lib/actions/videos";
import { formatarTamanho } from "@/lib/armazenamento/regras";
import { formatarTempo } from "@/lib/validators/catalogo";
import type { EstadoVideo, Reproducao } from "@/lib/video/provedor";
import { ACCEPT_VIDEO, DESCRICAO_VIDEO, ROTULO_SITUACAO_VIDEO } from "@/lib/video/regras";
import { ReaproveitarVideo } from "./reaproveitar-video";
import { useEnvioVideo } from "./use-envio-video";

export interface VideoAulaProps {
  aulaId: string;
  estado: EstadoVideo | null;
  /** Thumb gerada pelo worker (URL assinada curta). */
  poster: string | null;
  /** Vídeos prontos das outras aulas para "Usar vídeo de outra aula". */
  reaproveitaveis?: readonly OpcaoSelecao[];
  /** Nome e e-mail de quem confere a prévia (marca d'água). */
  marcaDagua: string;
}

const TOM_SITUACAO = { ENVIANDO: "neutro", PROCESSANDO: "warn", PRONTO: "ok", FALHOU: "warn" } as const;
const POLLING_MS = 4000;

/**
 * Vídeo da aula no editor: envio multipart direto ao storage (progresso, retomada, cancelar),
 * situação ao vivo por polling leve enquanto processa, prévia com o PlayerHls, reprocessar e
 * trocar (modal block). DONO e ADMIN — as actions conferem de novo.
 */
export function VideoAula({ aulaId, estado: inicial, poster, reaproveitaveis = [], marcaDagua }: VideoAulaProps) {
  const router = useRouter();
  const id = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const substituir = useRef(false);
  const [estado, setEstado] = useState(inicial);
  const [aviso, setAviso] = useState<string | null>(null);
  const [trocando, setTrocando] = useState(false);
  const [reaproveitando, setReaproveitando] = useState(false);
  const [reproducao, setReproducao] = useState<Reproducao | null>(null);
  const [pendente, iniciarTransicao] = useTransition();
  const envio = useEnvioVideo(aulaId, (enfileirado) => {
    setAviso(enfileirado ? null : "Vídeo enviado, mas a fila de processamento não respondeu. Use “Reprocessar” em instantes.");
    router.refresh();
  });

  // Situação ao vivo enquanto processa (sem WebSocket): pergunta a cada 4 s e recarrega no fim.
  useEffect(() => {
    if (estado?.situacao !== "PROCESSANDO") return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/video/${estado.videoId}/situacao`, { cache: "no-store" }).catch(() => null);
      if (!r?.ok) return;
      const novo = (await r.json()) as EstadoVideo;
      setEstado(novo);
      if (novo.situacao !== "PROCESSANDO") router.refresh();
    }, POLLING_MS);
    return () => clearInterval(t);
  }, [estado?.situacao, estado?.videoId, router]);

  const escolher = (arquivo: File | undefined) => {
    if (entrada.current) entrada.current.value = "";
    if (arquivo) void envio.iniciar(arquivo, substituir.current);
  };
  const abrirSeletor = (trocar: boolean) => {
    substituir.current = trocar;
    entrada.current?.click();
  };

  const reprocessar = () =>
    iniciarTransicao(async () => {
      if (!estado) return;
      const r = await acaoReprocessarVideo({ videoId: estado.videoId });
      if (!r.ok) return setAviso(r.erro);
      setAviso(r.dados.enfileirado ? null : "A fila de processamento não respondeu. Tente de novo em instantes.");
      router.refresh();
    });

  const assistir = () =>
    iniciarTransicao(async () => {
      const r = await acaoIniciarReproducao({ aulaId });
      if (!r.ok) return setAviso(r.erro);
      setReproducao(r.dados);
    });

  const renovar = useCallback(async () => {
    if (!reproducao) return { ok: false as const, erro: "Sem reprodução aberta." };
    return acaoRenovarReproducao({ aulaId, videoId: reproducao.videoId, sessaoId: reproducao.sessaoId });
  }, [aulaId, reproducao]);

  const ocupado = envio.enviando || pendente;
  const botaoEnviar = (
    <Button type="button" size="36" carregando={envio.enviando} onClick={() => abrirSeletor(false)}>
      <Upload className="size-3.5" aria-hidden />
      Enviar vídeo
    </Button>
  );
  const botaoReaproveitar = reaproveitaveis.length > 0 && !reaproveitando && (
    <Button type="button" variant="contorno" size="36" disabled={ocupado} onClick={() => setReaproveitando(true)}>
      <Library className="size-3.5" aria-hidden />
      Usar vídeo de outra aula
    </Button>
  );

  return (
    <div className="flex flex-col gap-3" aria-busy={ocupado || undefined}>
      <div className="flex items-center justify-between gap-2">
        <CartaoTitulo tamanho={15} como="h2" id={`${id}-titulo`}>
          Vídeo da aula
        </CartaoTitulo>
        {estado && !envio.enviando && <Selo tom={TOM_SITUACAO[estado.situacao]}>{ROTULO_SITUACAO_VIDEO[estado.situacao]}</Selo>}
      </div>

      <input
        ref={entrada}
        type="file"
        accept={ACCEPT_VIDEO}
        className="sr-only"
        tabIndex={-1}
        aria-labelledby={`${id}-titulo`}
        onChange={(e) => escolher(e.target.files?.[0])}
      />

      {envio.enviando ? (
        <div className="flex flex-col gap-2">
          <BarraProgresso valor={envio.progresso ?? 0} rotulo="Enviando o vídeo" mostrarPercentual />
          <p className="m-0 text-xs text-muted">Não feche esta página até o envio terminar.</p>
          <Button type="button" variant="fantasma" size="36" className="self-start" onClick={() => void envio.cancelar()}>
            <X className="size-3.5" aria-hidden />
            Cancelar envio
          </Button>
        </div>
      ) : envio.pausado ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="36" onClick={() => void envio.continuar()}>
            <Upload className="size-3.5" aria-hidden />
            Continuar envio
          </Button>
          <Button type="button" variant="fantasma" size="36" onClick={() => void envio.cancelar(envio.pausado?.videoId)}>
            Cancelar
          </Button>
        </div>
      ) : !estado ? (
        <EstadoVazio comMoldura icone={<Video />} titulo="Sem vídeo" descricao={`Envie o arquivo da aula (${DESCRICAO_VIDEO}) ou use o vídeo de outra aula.`}
          acao={
            <div className="flex flex-wrap justify-center gap-2">
              {botaoEnviar}
              {botaoReaproveitar}
            </div>
          }
        />
      ) : estado.situacao === "ENVIANDO" ? (
        <div className="flex flex-col gap-2">
          <Aviso tom="info">O envio de “{estado.nomeOriginal}” foi interrompido. Cancele e envie de novo.</Aviso>
          <Button type="button" variant="contorno" size="36" className="self-start" onClick={() => void envio.cancelar(estado.videoId).then(() => router.refresh())}>
            Cancelar envio
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {estado.situacao === "PRONTO" &&
            (reproducao ? (
              <PlayerHls acesso={reproducao} renovar={renovar} titulo={`Prévia: ${estado.nomeOriginal}`} poster={poster} marcaDagua={marcaDagua} autoPlay />
            ) : (
              <Button type="button" variant="contorno" size="36" className="self-start" carregando={pendente} onClick={assistir}>
                <Play className="size-3.5" aria-hidden />
                Assistir prévia
              </Button>
            ))}
          {estado.situacao === "PROCESSANDO" && (
            <Aviso tom="info">
              Processando “{estado.nomeOriginal}”: convertendo para streaming protegido. Leva alguns minutos; pode sair desta página.
              {estado.erro ? ` ${estado.erro}` : ""}
            </Aviso>
          )}
          {estado.situacao === "FALHOU" && <Aviso tom="erro">{estado.erro ?? "O processamento falhou."}</Aviso>}
          <p className="m-0 text-xs text-muted">
            {estado.nomeOriginal} · {formatarTamanho(estado.tamanhoBytes)}
            {estado.duracaoSeg !== null && ` · ${formatarTempo(estado.duracaoSeg)}`}
            {estado.resolucoes.length > 0 && ` · ${estado.resolucoes.join(", ")}`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="contorno" size="36" disabled={ocupado} onClick={() => setTrocando(true)}>
              <Upload className="size-3.5" aria-hidden />
              Trocar vídeo
            </Button>
            <Button type="button" variant="fantasma" size="36" carregando={pendente} disabled={ocupado} onClick={reprocessar}>
              <RefreshCw className="size-3.5" aria-hidden />
              Reprocessar
            </Button>
            {botaoReaproveitar}
          </div>
        </div>
      )}

      {reaproveitando && (
        <ReaproveitarVideo
          aulaId={aulaId}
          opcoes={reaproveitaveis}
          nomeAtual={estado && estado.situacao !== "ENVIANDO" ? estado.nomeOriginal : null}
          onCancelar={() => setReaproveitando(false)}
          onFeito={() => {
            setReaproveitando(false);
            setReproducao(null);
            router.refresh();
          }}
        />
      )}
      {(envio.erro || aviso) && <Aviso tom="erro">{envio.erro ?? aviso}</Aviso>}
      <ModalConfirmacaoBlock
        aberto={trocando}
        titulo="Trocar o vídeo da aula"
        mensagem={`O vídeo atual (${estado?.nomeOriginal ?? ""}) sai da aula e é apagado do armazenamento assim que o novo envio começar. Em seguida, escolha o arquivo novo.`}
        textoConfirmar="Escolher novo vídeo"
        onCancelar={() => setTrocando(false)}
        onConfirmar={() => {
          setTrocando(false);
          setReproducao(null);
          abrirSeletor(true);
        }}
      />
    </div>
  );
}
