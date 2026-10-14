"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { Eye, History, MoreVertical, RotateCcw, Upload } from "lucide-react";
import { MenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button, buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao } from "@/components/ui/cartao";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { acaoDescartarRascunhoVitrine, acaoPublicarVitrine, acaoReverterVitrine, acaoSalvarRascunhoVitrine } from "@/lib/actions/vitrine";
import { cn } from "@/lib/utils";
import { novaFileira, resumoDaMudanca, tituloComNome, type ConfigVitrine, type FileiraVitrine } from "@/lib/vitrine/config";
import { dataHoraCurta } from "../../conteudos/_components/comum";
import { AbaPlayer } from "./aba-player";
import { EstruturaVitrine } from "./estrutura-vitrine";
import { HistoricoVitrine, type VersaoPublicada } from "./historico-vitrine";
import { PreviaVitrine, type Dispositivo } from "./previa-vitrine";
import { PropriedadesDestaque } from "./propriedades-destaque";
import { PropriedadesFileira } from "./propriedades-fileira";
import { StatusVitrine, situacaoDoRascunho } from "./status-vitrine";
import { useRascunho } from "./use-rascunho";

export interface ConstrutorProps {
  rascunho: ConfigVitrine;
  versao: string | null;
  publicada: { numero: number; config: ConfigVitrine } | null;
  padrao: ConfigVitrine;
  historico: VersaoPublicada[];
  imagemUrl: string | null;
  rotulos: Record<string, string>;
  cursos: { id: string; titulo: string; status: string }[];
  grupos: { id: string; nome: string }[];
  /** Nome de quem edita ({nome} na lista e autor no histórico). */
  nome: string;
}

type Confirmacao = { tipo: "publicar" } | { tipo: "descartar" } | { tipo: "remover"; id: string } | { tipo: "reverter"; numero: number } | null;

const idNovo = () => `f-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Construtor da vitrine (README "Construtor da vitrine"; RN-135 a RN-138). Estado do rascunho no
 * cliente com autosave (`useRascunho`); a prévia é a vitrine real no servidor (iframe). Publicar,
 * remover, reverter e descartar passam pelo modal block (3 s).
 */
export function Construtor(p: ConstrutorProps) {
  const r = useRascunho({ config: p.rascunho, versao: p.versao }, acaoSalvarRascunhoVitrine);
  const [publicada, setPublicada] = useState(p.publicada);
  const [historico, setHistorico] = useState(p.historico);
  const [imagemUrl, setImagemUrl] = useState(p.imagemUrl);
  const [rotulos, setRotulos] = useState(p.rotulos);
  const [sel, setSel] = useState("destaque");
  const [aba, setAba] = useState<"vitrine" | "player">("vitrine");
  const [dispositivo, setDispositivo] = useState<Dispositivo>("desktop");
  const [confirmar, setConfirmar] = useState<Confirmacao>(null);
  const [verHistorico, setVerHistorico] = useState(false);
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const { config } = r;
  const situacao = situacaoDoRascunho(config, publicada?.config ?? null, p.padrao);
  const fileiraSel = config.fileiras.find((f) => f.id === sel);
  const lembrarRotulo = useCallback((id: string, rotulo: string) => setRotulos((x) => ({ ...x, [id]: rotulo })), []);
  const selecionar = useCallback((id: string) => {
    setSel(id);
    setAba("vitrine");
  }, []);
  const opcoesAlvo = useMemo(() => ({ cursos: p.cursos, rotulos, lembrarRotulo }), [p.cursos, rotulos, lembrarRotulo]);

  const mudarFileira = (f: FileiraVitrine) => r.mudar((c) => ({ ...c, fileiras: c.fileiras.map((x) => (x.id === f.id ? f : x)) }));
  const adicionar = () => {
    const f = novaFileira(idNovo());
    r.mudar((c) => ({ ...c, fileiras: [...c.fileiras, f] }));
    setSel(f.id);
  };
  const duplicar = (f: FileiraVitrine) => {
    const copia = { ...f, id: idNovo(), titulo: `${f.titulo} (cópia)`.slice(0, 60), grupos: [...f.grupos], itensManuais: [...f.itensManuais] };
    r.mudar((c) => {
      const i = c.fileiras.findIndex((x) => x.id === f.id);
      return { ...c, fileiras: [...c.fileiras.slice(0, i + 1), copia, ...c.fileiras.slice(i + 1)] };
    });
    setSel(copia.id);
  };

  /** Grava o pendente antes de qualquer ação do servidor; falhou = mostra e para. */
  const comRascunhoGravado = (acao: (versao: string | null) => Promise<void>) =>
    iniciar(async () => {
      const d = await r.descarregar();
      if (!d.ok) return setAviso({ tom: "erro", texto: r.erro ?? "O rascunho não foi salvo. Corrija e tente de novo." });
      await acao(d.versao);
    });

  const publicar = () =>
    comRascunhoGravado(async (versao) => {
      const x = await acaoPublicarVitrine({ versao });
      setConfirmar(null);
      if (!x.ok) return setAviso({ tom: "erro", texto: x.erro });
      if (x.dados.versao !== versao) r.substituir(config, x.dados.versao);
      setPublicada({ numero: x.dados.numero, config });
      setHistorico((h) => [{ numero: x.dados.numero, quando: dataHoraCurta(new Date(x.dados.publicadaEm)), publicadaPor: p.nome }, ...h]);
      setAviso({ tom: "ok", texto: `Versão ${x.dados.numero} publicada. Os alunos já veem a nova vitrine.` });
    });

  const trazer = (acao: typeof acaoReverterVitrine, entrada: Record<string, unknown>, texto: string) =>
    comRascunhoGravado(async (versao) => {
      const x = await acao({ versao, ...entrada });
      setConfirmar(null);
      if (!x.ok) return setAviso({ tom: "erro", texto: x.erro });
      r.substituir(x.dados.config, x.dados.versao);
      if (!x.dados.config.fileiras.some((f) => f.id === sel)) setSel("destaque");
      setAviso({ tom: "ok", texto });
    });

  const executarConfirmacao = () => {
    if (!confirmar) return;
    if (confirmar.tipo === "publicar") return publicar();
    if (confirmar.tipo === "descartar") return trazer(acaoDescartarRascunhoVitrine, {}, "Alterações descartadas: o rascunho voltou ao que está no ar.");
    if (confirmar.tipo === "reverter") return trazer(acaoReverterVitrine, { numero: confirmar.numero }, `A versão ${confirmar.numero} voltou para o rascunho. Publique para ela ir ao ar.`);
    const id = confirmar.id;
    r.mudar((c) => ({ ...c, fileiras: c.fileiras.filter((f) => f.id !== id) }));
    setSel("destaque");
    setConfirmar(null);
  };

  const textoConfirmacao = (): { titulo: string; mensagem: string; botao: string } => {
    if (confirmar?.tipo === "publicar") {
      const proxima = (publicada?.numero ?? 0) + 1;
      const muda = publicada ? resumoDaMudanca(publicada.config, config) : "a vitrine padrão dá lugar à montada aqui";
      return { titulo: `Publicar a versão ${proxima}?`, mensagem: `Todos os alunos passam a ver esta vitrine agora. O que muda: ${muda}.`, botao: "Publicar" };
    }
    if (confirmar?.tipo === "descartar") return { titulo: "Descartar alterações?", mensagem: "O rascunho volta a ser o que está no ar. As mudanças não publicadas se perdem.", botao: "Descartar" };
    if (confirmar?.tipo === "reverter")
      return { titulo: `Reverter para a versão ${confirmar.numero}?`, mensagem: "O rascunho atual é trocado por essa versão. Nada muda para os alunos até você publicar.", botao: "Reverter" };
    const f = config.fileiras.find((x) => confirmar?.tipo === "remover" && x.id === confirmar.id);
    return { titulo: "Remover fileira?", mensagem: `A fileira "${f ? tituloComNome(f.titulo, p.nome) : ""}" sai do rascunho. Os alunos só deixam de vê-la quando você publicar.`, botao: "Remover" };
  };
  const tc = textoConfirmacao();
  const travado = r.estado === "conflito";

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        variante="adminDestaque"
        titulo="Construtor da vitrine"
        descricao="Monte o que o aluno vê ao entrar: destaque, fileiras e o player da aula."
        acoes={
          <>
            <StatusVitrine situacao={situacao} numero={publicada?.numero ?? null} gravacao={r.estado} />
            <Link href="/" target="_blank" className={buttonVariants({ variant: "contorno", size: "40" })}>
              <Eye aria-hidden />
              Ver como aluno
            </Link>
            <Button type="button" size="40" disabled={travado || situacao === "publicado" || pendente} onClick={() => setConfirmar({ tipo: "publicar" })}>
              <Upload aria-hidden />
              Publicar
            </Button>
            <MenuAdmin
              gatilho={<Button type="button" variant="contorno" size="icone36" className="size-10" aria-label="Mais ações da vitrine" />}
              itens={[
                { rotulo: "Histórico de versões", icone: <History />, onSelecionar: () => setVerHistorico(true) },
                ...(situacao === "alterado" && !travado ? [{ rotulo: "Descartar alterações", icone: <RotateCcw />, perigo: true, onSelecionar: () => setConfirmar({ tipo: "descartar" }) }] : []),
              ]}
            >
              <MoreVertical aria-hidden />
            </MenuAdmin>
          </>
        }
      />

      {travado && (
        <Aviso tom="erro">
          <span className="flex flex-wrap items-center justify-between gap-3">
            Outra pessoa alterou a vitrine enquanto você editava. Recarregue para ver a versão atual (suas últimas mudanças não foram salvas).
            <Button type="button" size="36" variant="contorno" onClick={() => window.location.reload()}>
              Recarregar
            </Button>
          </span>
        </Aviso>
      )}
      {!travado && r.estado === "erro" && r.erro && <Aviso tom="erro">{r.erro}</Aviso>}
      {aviso && !travado && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}

      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border pb-3.5">
        <GrupoChips
          aria-label="Parte da área do aluno"
          opcoes={[
            { valor: "vitrine", rotulo: "Vitrine" },
            { valor: "player", rotulo: "Player da aula" },
          ]}
          valor={aba}
          onMudar={(v) => setAba(v as "vitrine" | "player")}
        />
        <GrupoChips
          aria-label="Tamanho da prévia"
          opcoes={[
            { valor: "desktop", rotulo: "Desktop" },
            { valor: "mobile", rotulo: "Mobile" },
          ]}
          valor={dispositivo}
          onMudar={(v) => setDispositivo(v as Dispositivo)}
        />
      </div>

      {/* A aba Vitrine fica montada (só escondida): a prévia não recarrega ao voltar. */}
      <div hidden={aba !== "vitrine"} className={cn("grid items-start gap-4 min-[1200px]:grid-cols-[280px_minmax(0,1fr)_320px]", aba !== "vitrine" && "hidden")}>
        <Cartao padding={18} como="section" aria-label="Estrutura da página" className="min-w-0">
          <EstruturaVitrine
            fileiras={config.fileiras}
            selecionado={sel}
            nome={p.nome}
            onSelecionar={setSel}
            onReordenar={(fileiras) => r.mudar((c) => ({ ...c, fileiras }))}
            onAlternarVisivel={(id) => r.mudar((c) => ({ ...c, fileiras: c.fileiras.map((f) => (f.id === id ? { ...f, visivel: !f.visivel } : f)) }))}
            onAdicionar={adicionar}
          />
        </Cartao>
        <Cartao padding={18} como="section" aria-label="Prévia ao vivo" className="order-last min-w-0 bg-surface-2 min-[1200px]:sticky min-[1200px]:top-4 min-[1200px]:order-none">
          <PreviaVitrine versao={r.versao} selecionado={sel} dispositivo={dispositivo} onSelecionar={selecionar} />
        </Cartao>
        <Cartao padding={18} como="section" aria-label="Propriedades" className="min-w-0">
          {fileiraSel ? (
            <PropriedadesFileira
              key={fileiraSel.id}
              fileira={fileiraSel}
              grupos={p.grupos}
              rotulos={rotulos}
              lembrarRotulo={lembrarRotulo}
              onMudar={mudarFileira}
              onDuplicar={() => duplicar(fileiraSel)}
              onRemover={() => setConfirmar({ tipo: "remover", id: fileiraSel.id })}
            />
          ) : (
            <PropriedadesDestaque destaque={config.destaque} imagemUrl={imagemUrl} onImagemUrl={setImagemUrl} onMudar={(d) => r.mudar((c) => ({ ...c, destaque: d }))} opcoes={opcoesAlvo} />
          )}
        </Cartao>
      </div>

      {aba === "player" && <AbaPlayer player={config.player} dispositivo={dispositivo} onMudar={(player) => r.mudar((c) => ({ ...c, player }))} />}

      <HistoricoVitrine
        aberto={verHistorico}
        versoes={historico}
        onFechar={() => setVerHistorico(false)}
        onReverter={(numero) => {
          setVerHistorico(false);
          setConfirmar({ tipo: "reverter", numero });
        }}
      />
      <ModalConfirmacaoBlock
        aberto={!!confirmar}
        titulo={tc.titulo}
        mensagem={tc.mensagem}
        textoConfirmar={tc.botao}
        carregando={pendente}
        onConfirmar={executarConfirmacao}
        onCancelar={() => setConfirmar(null)}
      />
    </div>
  );
}
