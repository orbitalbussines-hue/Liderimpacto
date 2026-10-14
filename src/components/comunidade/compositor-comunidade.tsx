"use client";

import { useRouter } from "next/navigation";
import { enviarComProgresso } from "@/components/admin/use-envio-arquivo";
import { CompositorPost, type CompositorPostProps, type ResultadoEnvioAnexo } from "@/components/engajamento/compositor-post";
import { acaoConfirmarEnvioAnexo, acaoIniciarEnvioAnexo, acaoPublicar } from "@/lib/actions/comunidade";
import { mimeDaExtensao } from "@/lib/armazenamento/regras";
import type { FinalidadeArquivo } from "@/lib/db/schema/_enums";

/** Anexo da comunidade em 3 tempos: allowlist + URL de PUT, PUT com progresso, confirmação (HEAD). */
async function enviarAnexo(arquivo: File, finalidade: FinalidadeArquivo, aoProgredir: (pct: number) => void): Promise<ResultadoEnvioAnexo> {
  const mime = arquivo.type || mimeDaExtensao(finalidade, arquivo.name) || "application/octet-stream";
  const pedido = await acaoIniciarEnvioAnexo({ nome: arquivo.name, mime, tamanho: arquivo.size }).catch(() => null);
  if (!pedido) return { ok: false, erro: "Sem conexão com o servidor." };
  if (!pedido.ok) return { ok: false, erro: pedido.erro };
  if (!(await enviarComProgresso(pedido.dados.envio, arquivo, aoProgredir))) return { ok: false, erro: "O envio falhou. Confira a conexão e tente de novo." };
  const confirmado = await acaoConfirmarEnvioAnexo({ arquivoId: pedido.dados.arquivoId }).catch(() => null);
  if (!confirmado) return { ok: false, erro: "Sem conexão com o servidor." };
  return confirmado.ok ? { ok: true, arquivoId: confirmado.dados.arquivoId } : { ok: false, erro: confirmado.erro };
}

export interface CompositorComunidadeProps extends Omit<CompositorPostProps, "enviarAnexo" | "publicar"> {
  /** Canal da página; `null` = feed de todos (o compositor mostra "Publicar em"). */
  canalId: string | null;
}

/** Compositor ligado às actions: publica e recarrega o feed (o post novo aparece no topo). */
export function CompositorComunidade({ canalId, canais, ...props }: CompositorComunidadeProps) {
  const router = useRouter();
  return (
    <CompositorPost
      {...props}
      canais={canalId ? [] : canais}
      enviarAnexo={enviarAnexo}
      publicar={async (d) => {
        const destino = canalId ?? d.canalId;
        if (!destino) return "Escolha o canal.";
        const r = await acaoPublicar({ canalId: destino, texto: d.texto, aulaId: d.aulaId, anexoIds: d.anexoIds, enquete: d.enquete });
        if (!r.ok) return r.erro;
        router.refresh();
        return null;
      }}
    />
  );
}
