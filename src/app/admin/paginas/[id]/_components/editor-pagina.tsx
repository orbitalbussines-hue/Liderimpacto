"use client";

import Link from "next/link";
import { useCallback, useState, useTransition } from "react";
import { ArrowLeft, ExternalLink, EyeOff, MoreVertical, Upload } from "lucide-react";
import { MenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button, buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao } from "@/components/ui/cartao";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { acaoDespublicarPagina, acaoPublicarPagina, acaoSalvarRascunhoPagina } from "@/lib/actions/paginas";
import type { SituacaoPagina } from "@/lib/db/schema/_enums";
import { ROTULO_BLOCO, pendenciasParaPublicar, type BlocoPagina, type ConfigPagina, type TipoBloco } from "@/lib/paginas/config";
import { novoBloco } from "@/lib/paginas/modelos";
import type { Dispositivo } from "@/app/admin/construtor/_components/previa-vitrine";
import { useRascunho, type EstadoGravacao } from "@/app/admin/construtor/_components/use-rascunho";
import { EstruturaPagina } from "./estrutura-pagina";
import { PreviaPagina } from "./previa-pagina";
import { PropriedadesBloco, type OpcoesEditor } from "./propriedades-bloco";
import { PropriedadesPagina, type DadosGerais } from "./propriedades-pagina";

export interface EditorPaginaProps {
  id: string;
  titulo: string;
  slug: string;
  situacao: SituacaoPagina;
  rascunho: ConfigPagina;
  publicada: ConfigPagina | null;
  publicacoes: number;
  versao: string;
  imagens: Record<string, string | null>;
  opcoes: OpcoesEditor;
  /** URL da área ("https://valmer.lideresdeimpacto.com.br"). */
  endereco: string;
}

const TEXTO_GRAVACAO: Record<EstadoGravacao, string> = { salvo: "Salvo", pendente: "Alterado", salvando: "Salvando…", erro: "Não salvo", conflito: "Conflito" };
const idNovo = () => `b-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Editor da página por BLOCOS (ADR-0022, RN-240/242): estrutura à esquerda, prévia real ao centro
 * (iframe), propriedades à direita. Autosave com trava (`useRascunho`); publicar e tirar do ar pelo
 * modal block. Nada de HTML livre: cada bloco tem só os seus campos de texto.
 */
export function EditorPagina(p: EditorPaginaProps) {
  const salvar = useCallback(
    (e: { versao: string | null; config: DadosGerais }) => acaoSalvarRascunhoPagina({ paginaId: p.id, versao: e.versao, titulo: e.config.titulo, slug: e.config.slug, config: e.config.config }),
    [p.id],
  );
  const r = useRascunho<DadosGerais>({ config: { titulo: p.titulo, slug: p.slug, config: p.rascunho }, versao: p.versao }, salvar);
  const [situacao, setSituacao] = useState(p.situacao);
  const [publicada, setPublicada] = useState(p.publicada);
  const [numero, setNumero] = useState(p.publicacoes);
  const [imagens, setImagens] = useState(p.imagens);
  const [sel, setSel] = useState(p.rascunho.blocos[0]?.id ?? "pagina");
  const [dispositivo, setDispositivo] = useState<Dispositivo>("desktop");
  const [confirmar, setConfirmar] = useState<"publicar" | "tirar" | "remover" | null>(null);
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const dados = r.config;
  const { blocos } = dados.config;
  const blocoSel = blocos.find((b) => b.id === sel);
  const mudarBlocos = (f: (b: BlocoPagina[]) => BlocoPagina[]) => r.mudar((d) => ({ ...d, config: { ...d.config, blocos: f(d.config.blocos) } }));
  const lembrarImagem = useCallback((id: string, url: string | null) => setImagens((x) => ({ ...x, [id]: url })), []);
  const alterada = JSON.stringify(publicada) !== JSON.stringify(dados.config);
  const travado = r.estado === "conflito";
  const faltas = pendenciasParaPublicar(dados.config);
  const urlPublica = `${p.endereco}/p/${dados.slug}`;

  const adicionar = (t: TipoBloco) => {
    const b = novoBloco(t, idNovo(), { produtoId: p.opcoes.cursos[0]?.id ?? null, ofertaId: p.opcoes.ofertas.find((o) => o.situacao === "ATIVA")?.id ?? null });
    const i = blocos.findIndex((x) => x.id === sel);
    mudarBlocos((bs) => (i < 0 ? [...bs, b] : [...bs.slice(0, i + 1), b, ...bs.slice(i + 1)]));
    setSel(b.id);
  };

  const comRascunhoGravado = (acao: (versao: string) => Promise<void>) =>
    iniciar(async () => {
      const d = await r.descarregar();
      if (!d.ok || !d.versao) {
        setConfirmar(null);
        return setAviso({ tom: "erro", texto: r.erro ?? "O rascunho não foi salvo. Corrija e tente de novo." });
      }
      await acao(d.versao);
    });

  const executar = () => {
    if (confirmar === "remover") {
      const id = sel;
      mudarBlocos((bs) => bs.filter((b) => b.id !== id));
      setSel("pagina");
      return setConfirmar(null);
    }
    comRascunhoGravado(async (versao) => {
      if (confirmar === "publicar") {
        const x = await acaoPublicarPagina({ paginaId: p.id, versao });
        setConfirmar(null);
        if (!x.ok) return setAviso({ tom: "erro", texto: x.erro });
        r.substituir(dados, x.dados.versao);
        setSituacao("PUBLICADA");
        setPublicada(dados.config);
        setNumero(x.dados.numero);
        return setAviso({ tom: "ok", texto: `Versão ${x.dados.numero} publicada em ${urlPublica}.` });
      }
      const x = await acaoDespublicarPagina({ paginaId: p.id, versao });
      setConfirmar(null);
      if (!x.ok) return setAviso({ tom: "erro", texto: x.erro });
      r.substituir(dados, x.dados.versao);
      setSituacao("RASCUNHO");
      setAviso({ tom: "ok", texto: "A página saiu do ar. O conteúdo continua aqui para publicar de novo." });
    });
  };

  const textos = {
    publicar: { titulo: `Publicar a versão ${numero + 1}?`, mensagem: `Quem abrir ${urlPublica} passa a ver esta versão agora.`, botao: "Publicar" },
    tirar: { titulo: "Tirar a página do ar?", mensagem: "Quem abrir o endereço passa a ver “página não encontrada”. O conteúdo fica guardado.", botao: "Tirar do ar" },
    remover: { titulo: "Remover o bloco?", mensagem: `O bloco ${blocoSel ? ROTULO_BLOCO[blocoSel.tipo] : ""} sai do rascunho. A página no ar só muda quando você publicar.`, botao: "Remover" },
  }[confirmar ?? "publicar"];

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/paginas" className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-text">
        <ArrowLeft className="size-3.5" aria-hidden />
        Páginas
      </Link>
      <CabecalhoPagina
        variante="adminDestaque"
        titulo={dados.titulo || "Página sem nome"}
        descricao={
          situacao === "PUBLICADA" ? (
            <a href={urlPublica} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              {urlPublica}
            </a>
          ) : (
            `Fora do ar · ${urlPublica}`
          )
        }
        acoes={
          <>
            <span role="status" className="text-xs font-semibold text-muted">
              {situacao === "PUBLICADA" ? (alterada ? "Publicada · alterações não publicadas" : `Publicada · versão ${numero}`) : "Rascunho"} · {TEXTO_GRAVACAO[r.estado]}
            </span>
            <Link href={`/previa-pagina/${p.id}`} target="_blank" className={buttonVariants({ variant: "contorno", size: "40" })}>
              <ExternalLink aria-hidden />
              Abrir prévia
            </Link>
            <Button type="button" size="40" disabled={travado || pendente || (situacao === "PUBLICADA" && !alterada)} onClick={() => (faltas.length ? setAviso({ tom: "erro", texto: `Para publicar, falta: ${faltas.join("; ")}.` }) : setConfirmar("publicar"))}>
              <Upload aria-hidden />
              Publicar
            </Button>
            {situacao === "PUBLICADA" && (
              <MenuAdmin gatilho={<Button type="button" variant="contorno" size="icone36" className="size-10" aria-label="Mais ações da página" />} itens={[{ rotulo: "Tirar do ar", icone: <EyeOff />, perigo: true, onSelecionar: () => setConfirmar("tirar") }]}>
                <MoreVertical aria-hidden />
              </MenuAdmin>
            )}
          </>
        }
      />

      {travado && (
        <Aviso tom="erro">
          <span className="flex flex-wrap items-center justify-between gap-3">
            Outra pessoa alterou esta página enquanto você editava. Recarregue para ver a versão atual.
            <Button type="button" size="36" variant="contorno" onClick={() => window.location.reload()}>
              Recarregar
            </Button>
          </span>
        </Aviso>
      )}
      {!travado && r.estado === "erro" && r.erro && <Aviso tom="erro">{r.erro}</Aviso>}
      {aviso && !travado && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}

      <div className="flex justify-end border-b border-border pb-3.5">
        <GrupoChips
          aria-label="Tamanho da prévia"
          opcoes={[
            { valor: "desktop", rotulo: "Desktop" },
            { valor: "mobile", rotulo: "Celular" },
          ]}
          valor={dispositivo}
          onMudar={(v) => setDispositivo(v as Dispositivo)}
        />
      </div>

      <div className="grid items-start gap-4 min-[1200px]:grid-cols-[280px_minmax(0,1fr)_340px]">
        <Cartao padding={18} como="section" aria-label="Estrutura da página" className="min-w-0">
          <EstruturaPagina
            blocos={blocos}
            selecionado={sel}
            temFormulario={blocos.some((b) => b.tipo === "FORMULARIO")}
            onSelecionar={setSel}
            onReordenar={(bs) => mudarBlocos(() => bs)}
            onAlternarVisivel={(id) => mudarBlocos((bs) => bs.map((b) => (b.id === id ? { ...b, visivel: !b.visivel } : b)))}
            onAdicionar={adicionar}
          />
        </Cartao>
        <Cartao padding={18} como="section" aria-label="Prévia" className="order-last min-w-0 bg-surface-2 min-[1200px]:sticky min-[1200px]:top-4 min-[1200px]:order-none">
          <PreviaPagina paginaId={p.id} versao={r.versao ?? p.versao} selecionado={sel} dispositivo={dispositivo} />
        </Cartao>
        <Cartao padding={18} como="section" aria-label="Propriedades" className="min-w-0">
          {blocoSel ? (
            <PropriedadesBloco
              key={blocoSel.id}
              bloco={blocoSel}
              opcoes={p.opcoes}
              imagens={imagens}
              lembrarImagem={lembrarImagem}
              onMudar={(b) => mudarBlocos((bs) => bs.map((x) => (x.id === b.id ? b : x)))}
              onRemover={() => setConfirmar("remover")}
            />
          ) : (
            <PropriedadesPagina dados={dados} endereco={p.endereco} imagens={imagens} lembrarImagem={lembrarImagem} onMudar={(d) => r.mudar(() => d)} />
          )}
        </Cartao>
      </div>

      <ModalConfirmacaoBlock aberto={!!confirmar} titulo={textos.titulo} mensagem={textos.mensagem} textoConfirmar={textos.botao} carregando={pendente} onConfirmar={executar} onCancelar={() => setConfirmar(null)} />
    </div>
  );
}
