"use client";

import { CampoImagem } from "@/components/admin/campo-imagem";
import { acaoDefinirThumbAula } from "@/lib/actions/aulas";

export interface ThumbAulaProps {
  aulaId: string;
  titulo: string;
  /** `updated_at` ISO da aula (trava). */
  versao: string;
  src: string | null;
}

/** Thumb 16:9 da aula (playlist, continuar assistindo), com envio direto ao storage. */
export function ThumbAula({ aulaId, titulo, versao, src }: ThumbAulaProps) {
  return (
    <CampoImagem
      rotulo="Thumb"
      proporcao="16/9"
      src={src}
      alt={`Thumb de ${titulo}`}
      onDefinir={(arquivoId) => acaoDefinirThumbAula({ aulaId, versao, arquivoId })}
      descricaoRemover="A thumb sai da aula e o arquivo é apagado do armazenamento."
      ajuda="Playlist e continuar assistindo"
    />
  );
}
