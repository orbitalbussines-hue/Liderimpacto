import { urlDeLeitura } from "@/lib/armazenamento/cliente";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { formatarTempo } from "@/lib/validators/catalogo";
import { estadoDoVideo, videoVivoDaAula, videosReaproveitaveis } from "@/lib/video/registro";
import { VideoAula } from "./video-aula";

export interface BlocoVideoAulaProps {
  aulaId: string;
  /** Duração conhecida (o pipeline de vídeo preenche `duracao_seg`). */
  duracaoSeg: number | null;
}

/**
 * Vídeo da aula (Server Component): lê o vídeo vivo da aula no criador do HOST e entrega o
 * estado ao bloco interativo. A thumb gerada pelo worker vira poster (URL assinada de 5 min).
 * Os vídeos prontos das outras aulas alimentam "Usar vídeo de outra aula".
 */
export async function BlocoVideoAula({ aulaId }: BlocoVideoAulaProps) {
  const { criador, usuario } = await membroDaPagina(EQUIPE);
  const v = await videoVivoDaAula(criador.id, aulaId);
  const poster =
    v?.situacao === "PRONTO" && v.thumb_chave
      ? await urlDeLeitura({ bucket: "hls", criadorId: criador.id, chave: v.thumb_chave }).catch(() => null)
      : null;
  const estado = v ? estadoDoVideo(v) : null;
  const reaproveitaveis = (await videosReaproveitaveis(criador.id, aulaId)).map((o) => ({
    valor: o.videoId,
    rotulo: `${o.modulo} · ${o.aula}${o.duracaoSeg === null ? "" : ` (${formatarTempo(o.duracaoSeg)})`}`,
    grupo: o.curso,
  }));
  return (
    <VideoAula
      // Estado novo do servidor (refresh) recria o bloco com ele.
      key={estado ? `${estado.videoId}-${estado.situacao}-${estado.tentativas}` : "sem-video"}
      aulaId={aulaId}
      estado={estado}
      poster={poster}
      reaproveitaveis={reaproveitaveis}
      marcaDagua={`${usuario.nome} · ${usuario.email}`}
    />
  );
}
