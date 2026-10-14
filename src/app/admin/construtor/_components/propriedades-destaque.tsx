"use client";

import { useId, useRef, useState } from "react";
import { ImageUp, RotateCcw } from "lucide-react";
import { useEnvioDeArquivo } from "@/components/admin/use-envio-arquivo";
import { AreaTexto } from "@/components/ui/area-texto";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { EspacoImagem } from "@/components/ui/espaco-imagem";
import { Interruptor } from "@/components/ui/interruptor";
import { acaoPrepararImagemDestaque } from "@/lib/actions/vitrine";
import { atributoAccept } from "@/lib/armazenamento/regras";
import type { DestaqueVitrine } from "@/lib/vitrine/config";
import { EditorBotao, type OpcoesAlvo } from "./editor-botao";

/** Linha "rótulo + descrição | interruptor" (toggles do construtor, como no protótipo). */
export function LinhaInterruptor({ titulo, descricao, ligado, onAlternar }: { titulo: string; descricao?: string; ligado: boolean; onAlternar: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div id={id} className="text-[13px] font-bold">
          {titulo}
        </div>
        {descricao && <div className="text-[11px] text-muted">{descricao}</div>}
      </div>
      <Interruptor ligado={ligado} onAlternar={onAlternar} aria-labelledby={id} />
    </div>
  );
}

export interface PropriedadesDestaqueProps {
  destaque: DestaqueVitrine;
  imagemUrl: string | null;
  onImagemUrl: (url: string | null) => void;
  onMudar: (d: DestaqueVitrine) => void;
  opcoes: OpcoesAlvo;
}

/** Propriedades do Destaque: imagem, selo, título, descrição, botões e avisos do canto. */
export function PropriedadesDestaque({ destaque: d, imagemUrl, onImagemUrl, onMudar, opcoes }: PropriedadesDestaqueProps) {
  const entrada = useRef<HTMLInputElement>(null);
  const { enviar, progresso, enviando, erro, setErro } = useEnvioDeArquivo("IMAGEM");
  const [preparando, setPreparando] = useState(false);
  const mudar = (p: Partial<DestaqueVitrine>) => onMudar({ ...d, ...p });

  const escolher = async (arquivo: File | undefined) => {
    if (entrada.current) entrada.current.value = "";
    if (!arquivo) return;
    const arquivoId = await enviar(arquivo);
    if (!arquivoId) return;
    setPreparando(true);
    const r = await acaoPrepararImagemDestaque({ arquivoId });
    setPreparando(false);
    if (!r.ok) return setErro(r.erro);
    onImagemUrl(r.dados.url);
    mudar({ imagemArquivoId: arquivoId });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <h2 className="m-0 text-sm font-extrabold">Destaque</h2>
      <div className="flex flex-col gap-2">
        <div className="overflow-hidden rounded-xl border border-border">
          <EspacoImagem src={d.imagemArquivoId ? imagemUrl : null} alt="Imagem de fundo do destaque" dica={d.imagemArquivoId ? undefined : "Usando a capa 16:9 do curso"} proporcao="16/9" sizes="320px" />
        </div>
        {progresso !== null && <BarraProgresso valor={progresso} rotulo="Enviando a imagem do destaque" mostrarPercentual />}
        {erro && (
          <p role="alert" className="m-0 text-xs font-semibold text-warn">
            {erro}
          </p>
        )}
        <input ref={entrada} type="file" accept={atributoAccept("IMAGEM")} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => escolher(e.target.files?.[0])} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="contorno" size="36" carregando={enviando || preparando} onClick={() => entrada.current?.click()}>
            <ImageUp aria-hidden />
            {d.imagemArquivoId ? "Trocar imagem" : "Enviar imagem"}
          </Button>
          {d.imagemArquivoId && (
            <Button type="button" variant="fantasma" size="36" onClick={() => mudar({ imagemArquivoId: null })}>
              <RotateCcw aria-hidden />
              Usar a capa do curso
            </Button>
          )}
        </div>
      </div>
      <Campo rotulo="Título" estiloRotulo="discreto" tamanho="42" fundo="bg" value={d.titulo} maxLength={80} onChange={(e) => mudar({ titulo: e.target.value })} />
      <AreaTexto rotulo="Descrição" estiloRotulo="discreto" fundo="bg" rows={4} value={d.descricao} maxLength={300} onChange={(e) => mudar({ descricao: e.target.value })} />
      <LinhaInterruptor titulo="Selo automático" descricao="Número de aulas do curso (ex.: 28 AULAS)" ligado={d.selo === null} onAlternar={(v) => mudar({ selo: v ? null : "" })} />
      {d.selo !== null && (
        <Campo rotulo="Texto do selo" estiloRotulo="discreto" tamanho="42" fundo="bg" value={d.selo} maxLength={20} placeholder="Vazio = sem selo" onChange={(e) => mudar({ selo: e.target.value })} />
      )}
      <EditorBotao nome="Botão principal" botao={d.botaoPrincipal} onMudar={(b) => mudar({ botaoPrincipal: b })} opcoes={opcoes} />
      <LinhaInterruptor
        titulo="Botão secundário"
        descricao="Ex.: Mais informações"
        ligado={!!d.botaoSecundario}
        onAlternar={(v) => {
          const principal = d.botaoPrincipal;
          const curso = principal.acao === "CURSO" || principal.acao === "CONTINUAR" ? principal.alvo : null;
          mudar({ botaoSecundario: v ? { texto: "Mais informações", acao: "CURSO", alvo: curso ?? opcoes.cursos[0]?.id ?? null } : null });
        }}
      />
      {d.botaoSecundario && <EditorBotao nome="Botão secundário" botao={d.botaoSecundario} onMudar={(b) => mudar({ botaoSecundario: b })} opcoes={opcoes} />}
      <LinhaInterruptor titulo="Avisos no canto inferior" descricao="Novidade e selo TOP 1" ligado={d.mostrarAvisos} onAlternar={(v) => mudar({ mostrarAvisos: v })} />
    </div>
  );
}
