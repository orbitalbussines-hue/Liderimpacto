"use client";

import { CampoImagem } from "@/components/admin/campo-imagem";
import { acaoDefinirCapaProduto } from "@/lib/actions/produtos";

export interface CapasProdutoProps {
  produtoId: string;
  titulo: string;
  versao: string;
  capa3x4: string | null;
  capa16x9: string | null;
}

/** Capas 3:4 (vitrine, fileiras) e 16:9 (destaque, página do curso; obrigatória para publicar). */
export function CapasProduto({ produtoId, titulo, versao, capa3x4, capa16x9 }: CapasProdutoProps) {
  const definir = (formato: "3x4" | "16x9") => (arquivoId: string | null) => acaoDefinirCapaProduto({ produtoId, versao, formato, arquivoId });
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 desk:grid-cols-1">
      <CampoImagem
        rotulo="Capa 3:4"
        proporcao="3/4"
        src={capa3x4}
        alt={`Capa 3:4 de ${titulo}`}
        onDefinir={definir("3x4")}
        descricaoRemover="A capa 3:4 sai do produto e o arquivo é apagado do armazenamento."
        ajuda="Vitrine e listas"
        classNamePrevia="max-w-[160px]"
      />
      <CampoImagem
        rotulo="Capa 16:9"
        proporcao="16/9"
        src={capa16x9}
        alt={`Capa 16:9 de ${titulo}`}
        onDefinir={definir("16x9")}
        descricaoRemover="A capa 16:9 sai do produto e o arquivo é apagado do armazenamento. Produto publicado não fica sem ela."
        ajuda="Destaque e página do curso"
      />
    </div>
  );
}
