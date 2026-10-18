"use client";

import { AreaTexto } from "@/components/ui/area-texto";
import { CaixaSelecao } from "@/components/ui/caixa-selecao";
import { Campo } from "@/components/ui/campo";
import type { ConteudoMarketing } from "@/lib/db/schema/marketing";

export interface CamposConteudoProps {
  valor: ConteudoMarketing;
  onMudar: (c: ConteudoMarketing) => void;
}

/** Assunto, prévia, título, texto e botão opcional (campanha e modelo usam os mesmos campos). */
export function CamposConteudo({ valor: c, onMudar }: CamposConteudoProps) {
  const mudar = (campo: "assunto" | "previa" | "titulo" | "corpo") => (e: { target: { value: string } }) => onMudar({ ...c, [campo]: e.target.value });
  const botao = (campo: "texto" | "url") => (e: { target: { value: string } }) => onMudar({ ...c, botao: { texto: "", url: "", ...c.botao, [campo]: e.target.value } });
  return (
    <div className="flex flex-col gap-4">
      <Campo rotulo="Assunto" value={c.assunto} onChange={mudar("assunto")} maxLength={150} tamanho="42" ajuda="O que aparece na caixa de entrada." />
      <Campo
        rotulo="Prévia (opcional)"
        value={c.previa}
        onChange={mudar("previa")}
        maxLength={150}
        tamanho="42"
        ajuda="Frase curta que alguns aplicativos de e-mail mostram ao lado do assunto."
      />
      <Campo rotulo="Título" value={c.titulo} onChange={mudar("titulo")} maxLength={120} tamanho="42" ajuda="O título grande no topo do e-mail." />
      <AreaTexto
        rotulo="Texto"
        value={c.corpo}
        onChange={mudar("corpo")}
        rows={9}
        maxLength={10_000}
        ajuda="Cada linha vira um parágrafo. Links começando com https:// ficam clicáveis. A saudação com o nome da pessoa entra sozinha."
      />
      <div className="flex flex-col gap-2">
        <CaixaSelecao className="text-text" rotulo="Botão no fim do e-mail" checked={c.botao !== null} onChange={(e) => onMudar({ ...c, botao: e.target.checked ? { texto: "", url: "" } : null })} />
        {c.botao && (
          <div className="grid gap-3 sm:grid-cols-[2fr_3fr]">
            <Campo rotulo="Texto do botão" value={c.botao.texto} onChange={botao("texto")} maxLength={40} tamanho="42" placeholder="Assistir agora" />
            <Campo rotulo="Link do botão" value={c.botao.url} onChange={botao("url")} maxLength={1000} tamanho="42" inputMode="url" placeholder="https://" />
          </div>
        )}
      </div>
    </div>
  );
}
