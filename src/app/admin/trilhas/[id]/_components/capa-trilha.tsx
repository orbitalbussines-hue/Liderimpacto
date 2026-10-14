"use client";

import { CampoImagem } from "@/components/admin/campo-imagem";
import { acaoDefinirCapaTrilha } from "@/lib/actions/trilhas";

/** Capa 16:9 da trilha (fileira "Trilhas para você" e página da trilha). */
export function CapaTrilha({ trilhaId, titulo, versao, src }: { trilhaId: string; titulo: string; versao: string; src: string | null }) {
  return (
    <CampoImagem
      rotulo="Capa 16:9"
      proporcao="16/9"
      src={src}
      alt={`Capa de ${titulo}`}
      onDefinir={(arquivoId) => acaoDefinirCapaTrilha({ trilhaId, versao, arquivoId })}
      descricaoRemover="A capa sai da trilha e o arquivo é apagado do armazenamento."
      ajuda="Vitrine (Trilhas para você) e página da trilha"
    />
  );
}
