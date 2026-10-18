"use client";

import { useState } from "react";
import { AreaTexto } from "@/components/ui/area-texto";
import { Campo } from "@/components/ui/campo";
import { Selecao } from "@/components/ui/selecao";
import type { ConteudoMarketing } from "@/lib/db/schema/marketing";
import { camposDoConteudo, type CamposAutomacao, type ErrosAutomacao } from "./campos";

interface CamposEmailProps {
  campos: CamposAutomacao;
  erros: ErrosAutomacao;
  modelos: readonly { id: string; nome: string; conteudo: ConteudoMarketing }[];
  onMudar: (parcial: Partial<CamposAutomacao>) => void;
}

/** Conteúdo do e-mail em TEXTO (o sistema monta o e-mail com a marca da área). Pode partir de um modelo. */
export function CamposEmail({ campos: c, erros, modelos, onMudar }: CamposEmailProps) {
  const [modelo, setModelo] = useState("");
  return (
    <div className="mb-2 flex flex-col gap-4 border-l-2 border-border py-2 pl-4 desk:ml-2">
      {modelos.length > 0 && (
        <Selecao
          rotulo="Começar de um modelo (opcional)"
          vazio="Escrever do zero"
          opcoes={modelos.map((m) => ({ valor: m.id, rotulo: m.nome }))}
          value={modelo}
          onChange={(e) => {
            setModelo(e.target.value);
            const m = modelos.find((x) => x.id === e.target.value);
            if (m) onMudar(camposDoConteudo(m.conteudo));
          }}
          ajuda="Copia o texto do modelo para cá. Você pode ajustar depois; o modelo não muda."
          classNameMoldura="max-w-md"
        />
      )}
      <div className="grid gap-4 desk:grid-cols-2">
        <Campo rotulo="Assunto" value={c.assunto} onChange={(e) => onMudar({ assunto: e.target.value })} maxLength={150} tamanho="42" erro={erros.assunto} placeholder="Ex.: Parabéns, você concluiu o curso!" />
        <Campo
          rotulo="Prévia (opcional)"
          value={c.previa}
          onChange={(e) => onMudar({ previa: e.target.value })}
          maxLength={150}
          tamanho="42"
          erro={erros.previa}
          ajuda="Aparece ao lado do assunto na caixa de entrada."
        />
      </div>
      <Campo rotulo="Título" value={c.titulo} onChange={(e) => onMudar({ titulo: e.target.value })} maxLength={120} tamanho="42" erro={erros.titulo} />
      <AreaTexto
        rotulo="Texto"
        rows={7}
        value={c.corpo}
        onChange={(e) => onMudar({ corpo: e.target.value })}
        maxLength={10_000}
        erro={erros.corpo}
        ajuda="Cada linha vira um parágrafo. Endereços https:// viram link. O e-mail já sai com saudação, marca da área e link para descadastrar."
      />
      <div className="grid gap-4 desk:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Campo rotulo="Botão (opcional)" value={c.botaoTexto} onChange={(e) => onMudar({ botaoTexto: e.target.value })} maxLength={40} tamanho="42" erro={erros.botaoTexto} placeholder="Ex.: Ver meu certificado" />
        <Campo
          rotulo="Link do botão"
          type="url"
          inputMode="url"
          value={c.botaoUrl}
          onChange={(e) => onMudar({ botaoUrl: e.target.value })}
          maxLength={1000}
          tamanho="42"
          erro={erros.botaoUrl}
          placeholder="https://"
          className="text-[13px]"
        />
      </div>
    </div>
  );
}
