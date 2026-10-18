"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Selecao } from "@/components/ui/selecao";
import { formatarCentavos } from "@/lib/pagamentos/regras";
import { ROTULO_BLOCO, idDoVideo, type BlocoPagina, type MidiaCapa } from "@/lib/paginas/config";
import { LinhaInterruptor } from "@/app/admin/construtor/_components/propriedades-destaque";
import { EditorBotaoPagina, ImagemDoStorage, ListaItens, Texto, TextoLongo, Titulo } from "./campos";

export interface OpcoesEditor {
  cursos: { id: string; titulo: string }[];
  ofertas: { id: string; nome: string; precoCentavos: number; situacao: string }[];
  tags: { id: string; nome: string }[];
}

export interface PropriedadesBlocoProps {
  bloco: BlocoPagina;
  opcoes: OpcoesEditor;
  imagens: Record<string, string | null>;
  lembrarImagem: (id: string, url: string | null) => void;
  onMudar: (b: BlocoPagina) => void;
  onRemover: () => void;
}

function Midia({ midia, imagens, lembrarImagem, onMudar }: { midia: MidiaCapa; imagens: Record<string, string | null>; lembrarImagem: PropriedadesBlocoProps["lembrarImagem"]; onMudar: (m: MidiaCapa) => void }) {
  const [modo, setModo] = useState<MidiaCapa["tipo"]>(midia.tipo);
  const [link, setLink] = useState(midia.tipo === "VIDEO" ? (midia.provedor === "YOUTUBE" ? `https://youtu.be/${midia.id}` : `https://vimeo.com/${midia.id}`) : "");
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2.5">
      <Selecao
        rotulo="Mídia ao lado do título"
        estiloRotulo="discreto"
        fundo="bg"
        value={modo}
        opcoes={[
          { valor: "NENHUMA", rotulo: "Nenhuma (título centralizado)" },
          { valor: "IMAGEM", rotulo: "Imagem" },
          { valor: "VIDEO", rotulo: "Vídeo do YouTube ou Vimeo" },
        ]}
        onChange={(e) => {
          const v = e.target.value as MidiaCapa["tipo"];
          setModo(v);
          // Trocar de modo tira a mídia anterior; a nova entra quando a imagem/link chega.
          if (v !== midia.tipo) onMudar({ tipo: "NENHUMA" });
        }}
      />
      {modo === "IMAGEM" && (
        <ImagemDoStorage
          rotulo="Imagem da capa"
          arquivoId={midia.tipo === "IMAGEM" ? midia.arquivoId : null}
          url={midia.tipo === "IMAGEM" ? (imagens[midia.arquivoId] ?? null) : null}
          onMudar={(id, url) => {
            if (id) lembrarImagem(id, url);
            onMudar(id ? { tipo: "IMAGEM", arquivoId: id } : { tipo: "NENHUMA" });
          }}
        />
      )}
      {modo === "VIDEO" && (
        <Texto
          rotulo="Link do vídeo"
          valor={link}
          max={300}
          placeholder="https://www.youtube.com/watch?v=…"
          ajuda={erro ?? "Só YouTube ou Vimeo."}
          onMudar={(v) => {
            setLink(v);
            const x = v.trim() ? idDoVideo(v) : null;
            setErro(v.trim() && !x ? "Link não reconhecido: use um link do YouTube ou do Vimeo." : null);
            onMudar(x ? { tipo: "VIDEO", ...x } : { tipo: "NENHUMA" });
          }}
        />
      )}
    </div>
  );
}

/** Formulário da direita para o bloco selecionado (cada tipo, só os seus campos). */
export function PropriedadesBloco({ bloco: b, opcoes, imagens, lembrarImagem, onMudar, onRemover }: PropriedadesBlocoProps) {
  const m = <T extends BlocoPagina>(x: Partial<T>) => onMudar({ ...b, ...x } as BlocoPagina);
  let corpo: React.ReactNode = null;
  switch (b.tipo) {
    case "CAPA":
      corpo = (
        <>
          <TextoLongo rotulo="Título" valor={b.titulo} max={120} linhas={2} onMudar={(titulo) => m({ titulo })} />
          <TextoLongo rotulo="Subtítulo" valor={b.subtitulo} max={300} linhas={3} onMudar={(subtitulo) => m({ subtitulo })} />
          <Midia midia={b.midia} imagens={imagens} lembrarImagem={lembrarImagem} onMudar={(midia) => m({ midia })} />
          <LinhaInterruptor titulo="Botão" ligado={!!b.botao} onAlternar={(v) => m({ botao: v ? { texto: "Quero começar", acao: "PRECO", url: null } : null })} />
          {b.botao && <EditorBotaoPagina rotulo="Botão da capa" botao={b.botao} onMudar={(botao) => m({ botao })} />}
        </>
      );
      break;
    case "BENEFICIOS":
      corpo = (
        <>
          <Texto rotulo="Título" valor={b.titulo} max={120} onMudar={(titulo) => m({ titulo })} />
          <ListaItens
            rotulo="Benefícios"
            itens={b.itens}
            max={12}
            min={1}
            novo={() => ({ titulo: "Novo benefício", texto: "" })}
            onMudar={(itens) => m({ itens })}
            render={(i, mudar) => (
              <>
                <Texto rotulo="Benefício" valor={i.titulo} max={80} onMudar={(titulo) => mudar({ ...i, titulo })} />
                <TextoLongo rotulo="Descrição" valor={i.texto} max={300} linhas={2} onMudar={(texto) => mudar({ ...i, texto })} />
              </>
            )}
          />
        </>
      );
      break;
    case "MODULOS":
      corpo = (
        <>
          <Texto rotulo="Título" valor={b.titulo} max={120} ajuda="Vazio = nome do curso." onMudar={(titulo) => m({ titulo })} />
          <Selecao rotulo="Curso" estiloRotulo="discreto" fundo="bg" vazio="Escolha o curso" value={b.produtoId ?? ""} opcoes={opcoes.cursos.map((c) => ({ valor: c.id, rotulo: c.titulo }))} onChange={(e) => m({ produtoId: e.target.value || null })} />
          <LinhaInterruptor titulo="Mostrar as aulas" descricao="Cada módulo abre a lista de aulas" ligado={b.mostrarAulas} onAlternar={(mostrarAulas) => m({ mostrarAulas })} />
          <p className="m-0 text-[11px] text-muted">Só módulos publicados aparecem. O conteúdo das aulas não é exibido, apenas os títulos.</p>
        </>
      );
      break;
    case "AUTOR":
      corpo = (
        <>
          <Texto rotulo="Chamada" valor={b.titulo} max={120} onMudar={(titulo) => m({ titulo })} />
          <Texto rotulo="Nome" valor={b.nome} max={80} onMudar={(nome) => m({ nome })} />
          <TextoLongo rotulo="Sobre" valor={b.texto} max={1500} linhas={6} ajuda="Cada linha vira um parágrafo." onMudar={(texto) => m({ texto })} />
          <ImagemDoStorage
            rotulo="Foto"
            proporcao="3/4"
            arquivoId={b.imagemArquivoId}
            url={b.imagemArquivoId ? (imagens[b.imagemArquivoId] ?? null) : null}
            onMudar={(id, url) => {
              if (id) lembrarImagem(id, url);
              m({ imagemArquivoId: id });
            }}
          />
        </>
      );
      break;
    case "DEPOIMENTOS":
      corpo = (
        <>
          <Texto rotulo="Título" valor={b.titulo} max={120} onMudar={(titulo) => m({ titulo })} />
          <ListaItens
            rotulo="Depoimentos"
            itens={b.itens}
            max={12}
            min={1}
            novo={() => ({ nome: "Nome", detalhe: "", texto: "Depoimento." })}
            onMudar={(itens) => m({ itens })}
            render={(i, mudar) => (
              <>
                <Texto rotulo="Nome" valor={i.nome} max={80} onMudar={(nome) => mudar({ ...i, nome })} />
                <Texto rotulo="Detalhe (cargo, cidade)" valor={i.detalhe} max={80} onMudar={(detalhe) => mudar({ ...i, detalhe })} />
                <TextoLongo rotulo="Depoimento" valor={i.texto} max={600} linhas={3} onMudar={(texto) => mudar({ ...i, texto })} />
              </>
            )}
          />
        </>
      );
      break;
    case "PRECO":
      corpo = (
        <>
          <Texto rotulo="Título" valor={b.titulo} max={120} onMudar={(titulo) => m({ titulo })} />
          <Selecao
            rotulo="Oferta"
            estiloRotulo="discreto"
            fundo="bg"
            vazio="Escolha a oferta"
            value={b.ofertaId ?? ""}
            ajuda="O botão abre o pagamento desta oferta. Cupom e afiliado do link da página seguem junto."
            opcoes={opcoes.ofertas.map((o) => ({ valor: o.id, rotulo: `${o.nome} · ${formatarCentavos(o.precoCentavos)}${o.situacao === "ATIVA" ? "" : " (pausada)"}` }))}
            onChange={(e) => m({ ofertaId: e.target.value || null })}
          />
          <ListaItens rotulo="O que está incluído" itens={b.itens} max={12} novo={() => "Novo item"} onMudar={(itens) => m({ itens })} render={(t, mudar) => <Texto rotulo="Item" valor={t} max={120} onMudar={mudar} />} />
          <Texto rotulo="Texto do botão" valor={b.textoBotao} max={40} onMudar={(textoBotao) => m({ textoBotao })} />
          <Texto rotulo="Observação" valor={b.observacao} max={200} onMudar={(observacao) => m({ observacao })} />
        </>
      );
      break;
    case "GARANTIA":
      corpo = (
        <>
          <Texto rotulo="Título" valor={b.titulo} max={120} onMudar={(titulo) => m({ titulo })} />
          <Texto rotulo="Dias de garantia" valor={String(b.dias)} max={3} ajuda="0 = não mostrar o prazo." onMudar={(v) => m({ dias: Math.min(365, Math.max(0, Number.parseInt(v, 10) || 0)) })} />
          <TextoLongo rotulo="Texto" valor={b.texto} max={600} onMudar={(texto) => m({ texto })} />
        </>
      );
      break;
    case "FAQ":
      corpo = (
        <>
          <Texto rotulo="Título" valor={b.titulo} max={120} onMudar={(titulo) => m({ titulo })} />
          <ListaItens
            rotulo="Perguntas"
            itens={b.itens}
            max={20}
            min={1}
            novo={() => ({ pergunta: "Nova pergunta?", resposta: "Resposta." })}
            onMudar={(itens) => m({ itens })}
            render={(i, mudar) => (
              <>
                <Texto rotulo="Pergunta" valor={i.pergunta} max={200} onMudar={(pergunta) => mudar({ ...i, pergunta })} />
                <TextoLongo rotulo="Resposta" valor={i.resposta} max={1500} linhas={3} onMudar={(resposta) => mudar({ ...i, resposta })} />
              </>
            )}
          />
        </>
      );
      break;
    case "CHAMADA":
      corpo = (
        <>
          <TextoLongo rotulo="Título" valor={b.titulo} max={120} linhas={2} onMudar={(titulo) => m({ titulo })} />
          <TextoLongo rotulo="Texto" valor={b.texto} max={400} linhas={3} onMudar={(texto) => m({ texto })} />
          <EditorBotaoPagina rotulo="Botão" botao={b.botao} onMudar={(botao) => m({ botao })} />
        </>
      );
      break;
    case "FORMULARIO":
      corpo = (
        <>
          <Texto rotulo="Título" valor={b.titulo} max={120} onMudar={(titulo) => m({ titulo })} />
          <TextoLongo rotulo="Texto" valor={b.texto} max={400} linhas={2} onMudar={(texto) => m({ texto })} />
          <Texto rotulo="Texto do botão" valor={b.textoBotao} max={40} onMudar={(textoBotao) => m({ textoBotao })} />
          <TextoLongo rotulo="Consentimento (LGPD)" valor={b.consentimento} max={400} linhas={4} ajuda="A pessoa precisa marcar. O texto e a data ficam gravados com o lead." onMudar={(consentimento) => m({ consentimento })} />
          <Selecao rotulo="Tag do lead" estiloRotulo="discreto" fundo="bg" vazio="Sem tag" value={b.tagId ?? ""} opcoes={opcoes.tags.map((t) => ({ valor: t.id, rotulo: t.nome }))} onChange={(e) => m({ tagId: e.target.value || null })} />
          <TextoLongo rotulo="Mensagem depois de enviar" valor={b.sucesso} max={300} linhas={2} ajuda="Em funil, a pessoa segue para a próxima etapa." onMudar={(sucesso) => m({ sucesso })} />
        </>
      );
      break;
  }
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-2">
        <Titulo>{ROTULO_BLOCO[b.tipo]}</Titulo>
        <Button type="button" variant="fantasma" size="36" className="text-warn" onClick={onRemover}>
          <Trash2 aria-hidden />
          Remover
        </Button>
      </div>
      {corpo}
    </div>
  );
}
