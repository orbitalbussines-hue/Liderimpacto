"use client";

import { useState } from "react";
import { ErroDeNegocio } from "@/lib/acao";
import { acaoConfirmarEnvio, acaoIniciarEnvio } from "@/lib/actions/arquivos";
import type { UrlDeEnvio } from "@/lib/armazenamento/cliente";
import { mimeDaExtensao, validarEnvio } from "@/lib/armazenamento/regras";
import type { FinalidadeArquivo } from "@/lib/db/schema/_enums";

/** PUT direto no storage com progresso (fetch nao informa progresso de envio). */
function enviarComProgresso(envio: UrlDeEnvio, arquivo: File, aoProgredir: (pct: number) => void): Promise<boolean> {
  return new Promise((resolver) => {
    const xhr = new XMLHttpRequest();
    xhr.open(envio.metodo, envio.url);
    for (const [nome, valor] of Object.entries(envio.cabecalhos)) xhr.setRequestHeader(nome, valor);
    xhr.upload.onprogress = (e) => e.lengthComputable && aoProgredir(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => resolver(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolver(false);
    xhr.onabort = () => resolver(false);
    xhr.send(arquivo);
  });
}

/**
 * Envio de arquivo do admin direto ao storage: valida na tela (mesma allowlist do servidor),
 * pede a URL assinada, sobe com progresso e confirma (HEAD no servidor). Devolve o `arquivoId`
 * DISPONIVEL para a action de destino (capa, thumb, material) ou `null` com `erro` preenchido.
 */
export function useEnvioDeArquivo(finalidade: FinalidadeArquivo) {
  const [progresso, setProgresso] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(arquivo: File): Promise<string | null> {
    setErro(null);
    const mime = arquivo.type || mimeDaExtensao(finalidade, arquivo.name) || "application/octet-stream";
    try {
      validarEnvio(finalidade, { nome: arquivo.name, mime, tamanho: arquivo.size });
    } catch (e) {
      setErro(e instanceof ErroDeNegocio ? e.message : "Arquivo inválido.");
      return null;
    }
    const pedido = await acaoIniciarEnvio({ finalidade, nome: arquivo.name, mime, tamanho: arquivo.size });
    if (!pedido.ok) {
      setErro(pedido.erro);
      return null;
    }
    setProgresso(0);
    const subiu = await enviarComProgresso(pedido.dados.envio, arquivo, setProgresso);
    if (!subiu) {
      setProgresso(null);
      setErro("O envio falhou. Confira a conexão e tente de novo.");
      return null;
    }
    const confirmado = await acaoConfirmarEnvio({ arquivoId: pedido.dados.arquivoId });
    setProgresso(null);
    if (!confirmado.ok) {
      setErro(confirmado.erro);
      return null;
    }
    return pedido.dados.arquivoId;
  }

  return { enviar, progresso, enviando: progresso !== null, erro, setErro };
}
