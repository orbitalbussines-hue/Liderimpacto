"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { Button } from "@/components/ui/button";
import { EspacoImagem } from "@/components/ui/espaco-imagem";
import type { Resultado } from "@/lib/acao";
import { ALLOWLIST, atributoAccept } from "@/lib/armazenamento/regras";
import { cn } from "@/lib/utils";
import { useEnvioDeArquivo } from "./use-envio-arquivo";

export interface CampoImagemProps {
  rotulo: string;
  proporcao: "3/4" | "16/9";
  /** URL assinada da imagem atual (null = sem imagem). */
  src: string | null;
  alt: string;
  /** Liga o arquivo enviado (ou `null` para remover) ao registro: action de capa/thumb. */
  onDefinir: (arquivoId: string | null) => Promise<Resultado<unknown>>;
  /** Texto do modal de remoção. */
  descricaoRemover: string;
  ajuda?: string;
  /** Largura da prévia (3:4 fica estreita). */
  classNamePrevia?: string;
}

/**
 * Imagem com envio direto ao storage (capa 3:4/16:9, thumb): prévia com EspacoImagem, enviar ou
 * trocar (input de arquivo nativo), progresso e remover pelo modal block. Recarrega a página
 * no fim (a URL assinada e a versão vêm do servidor).
 */
export function CampoImagem({ rotulo, proporcao, src, alt, onDefinir, descricaoRemover, ajuda, classNamePrevia }: CampoImagemProps) {
  const router = useRouter();
  const id = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const { enviar, progresso, enviando, erro, setErro } = useEnvioDeArquivo("IMAGEM");
  const [removendo, setRemovendo] = useState(false);
  const [pendente, iniciar] = useTransition();

  const definir = (arquivoId: string | null) =>
    iniciar(async () => {
      const r = await onDefinir(arquivoId);
      setRemovendo(false);
      if (!r.ok) return setErro(r.erro);
      router.refresh();
    });

  const escolher = async (arquivo: File | undefined) => {
    if (entrada.current) entrada.current.value = "";
    if (!arquivo) return;
    const arquivoId = await enviar(arquivo);
    if (arquivoId) definir(arquivoId);
  };

  const ocupado = enviando || pendente;
  return (
    <div className="flex flex-col gap-2.5" aria-busy={ocupado || undefined}>
      <div className="flex items-baseline justify-between gap-2">
        <span id={`${id}-rotulo`} className="text-[13px] font-semibold">
          {rotulo}
        </span>
        {ajuda && <span className="text-xs text-muted">{ajuda}</span>}
      </div>
      <div className={cn("overflow-hidden rounded-xl border border-border", classNamePrevia)}>
        <EspacoImagem src={src} alt={src ? alt : ""} dica={src ? undefined : "Sem imagem"} proporcao={proporcao} sizes="320px" />
      </div>
      {progresso !== null && <BarraProgresso valor={progresso} rotulo={`Enviando ${rotulo.toLowerCase()}`} mostrarPercentual />}
      {erro && (
        <p role="alert" className="m-0 text-xs font-semibold text-warn">
          {erro}
        </p>
      )}
      <input
        ref={entrada}
        id={`${id}-arquivo`}
        type="file"
        accept={atributoAccept("IMAGEM")}
        className="sr-only"
        tabIndex={-1}
        aria-labelledby={`${id}-rotulo`}
        onChange={(e) => escolher(e.target.files?.[0])}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="contorno" size="36" carregando={ocupado} onClick={() => entrada.current?.click()}>
          <ImageUp className="size-3.5" aria-hidden />
          {src ? "Trocar" : "Enviar imagem"}
          <span className="sr-only">: {rotulo}</span>
        </Button>
        {src && (
          <Button type="button" variant="fantasma" size="36" disabled={ocupado} onClick={() => setRemovendo(true)} className="text-warn">
            <Trash2 className="size-3.5" aria-hidden />
            Remover
            <span className="sr-only">: {rotulo}</span>
          </Button>
        )}
      </div>
      <p className="m-0 text-xs text-muted">{ALLOWLIST.IMAGEM.descricao}</p>
      <ModalConfirmacaoBlock
        aberto={removendo}
        titulo={`Remover ${rotulo.toLowerCase()}`}
        mensagem={descricaoRemover}
        textoConfirmar="Remover"
        carregando={pendente}
        onCancelar={() => setRemovendo(false)}
        onConfirmar={() => definir(null)}
      />
    </div>
  );
}
