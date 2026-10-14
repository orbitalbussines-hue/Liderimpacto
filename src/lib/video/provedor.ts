/**
 * Contrato de provedor de vídeo (docs/ARQUITETURA.md §2: `VideoProvider`). O app só fala com
 * esta interface; trocar self-host por Mux/Bunny = nova implementação, sem mexer nas telas.
 * Implementação atual: `ProvedorProprio` (self-host, docs/ARQUITETURA_VPS.md, ADR-0005).
 *
 * Todo método recebe o criador do HOST (nunca do corpo) e devolve só o que é desse criador.
 */
import type { SituacaoVideo } from "@/lib/db/schema/_enums";

export type { SituacaoVideo };

/** Quem pede, já autenticado e autorizado pela action/rota. */
export interface ContextoVideo {
  criadorId: string;
  usuarioId: string;
}

export interface PedidoEnvio {
  aulaId: string;
  nome: string;
  mime: string;
  tamanho: number;
  /** Já existe vídeo na aula: só troca com confirmação explícita (modal block). */
  substituir: boolean;
}

/** Envio multipart direto do navegador ao storage (as URLs de cada parte vêm sob demanda). */
export interface Envio {
  videoId: string;
  tamanhoParte: number;
  totalPartes: number;
}

export interface Reproducao {
  videoId: string;
  /** Sessão de reprodução (limite de telas); vai no token e na renovação. */
  sessaoId: string;
  /** Master assinada (`...master.m3u8?t=...`). */
  urlMaster: string;
  /** Rota da chave AES-128 (exige cookie de sessão + token). */
  urlChave: string;
  token: string;
  /** ISO. O player renova antes disso. */
  expiraEm: string;
}

/** Evento do pipeline: interno (worker -> app) no self-host; webhook nos gerenciados. */
export type EventoVideo =
  | { tipo: "video.processando"; videoId: string; tentativa: number }
  | {
      tipo: "video.pronto";
      videoId: string;
      tentativa: number;
      duracaoSeg: number;
      resolucoes: string[];
      prefixoHls: string;
      thumbChave: string;
      cpuSeg: number | null;
      log: string;
    }
  | { tipo: "video.falhou"; videoId: string; tentativa: number; erro: string; log: string; definitivo: boolean };

export interface EstadoVideo {
  videoId: string;
  situacao: SituacaoVideo;
  nomeOriginal: string;
  tamanhoBytes: number;
  duracaoSeg: number | null;
  resolucoes: string[];
  erro: string | null;
  tentativas: number;
}

export interface ProvedorVideo {
  criarEnvio(ctx: ContextoVideo, pedido: PedidoEnvio): Promise<Envio>;
  /** Fecha o envio (confere o objeto) e põe na fila. `enfileirado: false` = fila fora do ar. */
  concluirEnvio(ctx: ContextoVideo, videoId: string, dadosDoEnvio: unknown): Promise<{ enfileirado: boolean }>;
  /** Emite o acesso de reprodução. Quem chama já conferiu `podeAssistir`. */
  tokenDeReproducao(ctx: ContextoVideo & { sessaoLoginId: string; ip: string; userAgent: string }, aulaId: string): Promise<Reproducao>;
  /** Aplica o evento; `false` = ignorado (vídeo trocado/excluído no meio, evento repetido). */
  aoReceberEvento(evento: unknown): Promise<boolean>;
  situacao(criadorId: string, videoId: string): Promise<EstadoVideo | null>;
}
