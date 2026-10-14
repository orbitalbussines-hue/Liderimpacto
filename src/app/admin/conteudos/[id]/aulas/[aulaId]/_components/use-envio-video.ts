"use client";

import { useRef, useState } from "react";
import { ErroDeNegocio } from "@/lib/acao";
import { acaoAssinarPartesVideo, acaoCancelarEnvioVideo, acaoConcluirEnvioVideo, acaoIniciarEnvioVideo } from "@/lib/actions/videos";
import { faixaDaParte, mimeDoVideo, totalDePartes, validarEnvioVideo } from "@/lib/video/regras";

const PARALELAS = 3;
const TENTATIVAS_POR_PARTE = 4;
const LOTE_DE_URLS = 20;

type Parte = { numero: number; etag: string };

/** PUT de UMA parte direto no storage, com progresso. Devolve a ETag (CORS do bucket expõe). */
function enviarParte(url: string, corpo: Blob, aoProgredir: (bytes: number) => void, xhrs: Set<XMLHttpRequest>): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const xhr = new XMLHttpRequest();
    xhrs.add(xhr);
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => aoProgredir(e.loaded);
    xhr.onload = () => {
      xhrs.delete(xhr);
      const etag = xhr.getResponseHeader("ETag");
      if (xhr.status >= 200 && xhr.status < 300 && etag) resolver(etag);
      else rejeitar(new Error(`parte recusada (${xhr.status})`));
    };
    xhr.onerror = xhr.onabort = () => {
      xhrs.delete(xhr);
      rejeitar(new Error("falha de rede"));
    };
    xhr.send(corpo);
  });
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface EnvioEmAndamento {
  videoId: string;
  arquivo: File;
}

/**
 * Envio multipart do vídeo direto ao storage: partes de 16 MB, 3 em paralelo, cada parte com
 * até 4 tentativas. Parte que esgota as tentativas PAUSA o envio (as concluídas ficam guardadas):
 * "Continuar" retoma só o que falta. "Cancelar" aborta o multipart no servidor.
 */
export function useEnvioVideo(aulaId: string, aoConcluir: (enfileirado: boolean) => void) {
  const [progresso, setProgresso] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pausado, setPausado] = useState<EnvioEmAndamento | null>(null);
  const concluidas = useRef(new Map<number, Parte>());
  const xhrs = useRef(new Set<XMLHttpRequest>());
  const cancelado = useRef(false);
  const videoAtual = useRef<string | null>(null);

  async function subir(envio: EnvioEmAndamento) {
    const { videoId, arquivo } = envio;
    const total = totalDePartes(arquivo.size);
    const emAndamento = new Map<number, number>();
    const bytesConcluidos = () => [...concluidas.current.keys()].reduce((s, n) => s + faixaDaParte(n, arquivo.size).fim - faixaDaParte(n, arquivo.size).inicio, 0);
    const atualizar = () => setProgresso(Math.min(99, Math.round(((bytesConcluidos() + [...emAndamento.values()].reduce((s, b) => s + b, 0)) / arquivo.size) * 100)));

    const faltam = Array.from({ length: total }, (_, i) => i + 1).filter((n) => !concluidas.current.has(n));
    setPausado(null);
    setErro(null);
    atualizar();
    try {
      for (let i = 0; i < faltam.length; i += LOTE_DE_URLS) {
        const lote = faltam.slice(i, i + LOTE_DE_URLS);
        const urls = await acaoAssinarPartesVideo({ videoId, partes: lote });
        if (!urls.ok) throw new ErroDeNegocio(urls.erro);
        const fila = [...urls.dados];
        const trabalhador = async () => {
          for (let p = fila.shift(); p; p = fila.shift()) {
            const { inicio, fim } = faixaDaParte(p.numero, arquivo.size);
            for (let tentativa = 1; ; tentativa++) {
              if (cancelado.current) throw new Error("cancelado");
              try {
                const etag = await enviarParte(p.url, arquivo.slice(inicio, fim), (b) => (emAndamento.set(p.numero, b), atualizar()), xhrs.current);
                emAndamento.delete(p.numero);
                concluidas.current.set(p.numero, { numero: p.numero, etag });
                atualizar();
                break;
              } catch (e) {
                emAndamento.delete(p.numero);
                if (tentativa >= TENTATIVAS_POR_PARTE || cancelado.current) throw e;
                await esperar(1000 * 2 ** tentativa);
              }
            }
          }
        };
        await Promise.all(Array.from({ length: PARALELAS }, trabalhador));
      }
      const fim = await acaoConcluirEnvioVideo({ videoId, partes: [...concluidas.current.values()] });
      if (!fim.ok) throw new ErroDeNegocio(fim.erro);
      setProgresso(null);
      concluidas.current.clear();
      aoConcluir(fim.dados.enfileirado);
    } catch (e) {
      if (cancelado.current) return;
      setProgresso(null);
      if (e instanceof ErroDeNegocio) {
        setErro(e.message);
        concluidas.current.clear();
        return;
      }
      setErro("O envio parou (conexão?). As partes já enviadas foram guardadas: continue de onde parou.");
      setPausado(envio);
    }
  }

  async function iniciar(arquivo: File, substituir: boolean) {
    setErro(null);
    cancelado.current = false;
    concluidas.current.clear();
    const mime = arquivo.type || mimeDoVideo(arquivo.name) || "application/octet-stream";
    try {
      validarEnvioVideo({ nome: arquivo.name, mime, tamanho: arquivo.size });
    } catch (e) {
      return setErro(e instanceof ErroDeNegocio ? e.message : "Arquivo inválido.");
    }
    setProgresso(0);
    const r = await acaoIniciarEnvioVideo({ aulaId, nome: arquivo.name, mime, tamanho: arquivo.size, substituir });
    if (!r.ok) {
      setProgresso(null);
      return setErro(r.erro);
    }
    videoAtual.current = r.dados.videoId;
    await subir({ videoId: r.dados.videoId, arquivo });
  }

  /** Cancela o envio deste navegador ou um ENVIANDO órfão (página recarregada no meio). */
  async function cancelar(videoId = videoAtual.current) {
    if (!videoId) return;
    cancelado.current = true;
    for (const x of xhrs.current) x.abort();
    concluidas.current.clear();
    setProgresso(null);
    setPausado(null);
    const r = await acaoCancelarEnvioVideo({ videoId });
    if (!r.ok) setErro(r.erro);
  }

  return { iniciar, continuar: () => pausado && subir(pausado), cancelar, progresso, erro, pausado, enviando: progresso !== null };
}
