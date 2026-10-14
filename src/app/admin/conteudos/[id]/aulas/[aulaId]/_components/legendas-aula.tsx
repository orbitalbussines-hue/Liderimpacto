"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FileUp, MoreVertical, RefreshCw, Trash2 } from "lucide-react";
import { MenuAdmin } from "@/components/admin/menu-admin";
import { useEnvioDeArquivo } from "@/components/admin/use-envio-arquivo";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { ErroDeNegocio } from "@/lib/acao";
import { acaoEnviarLegenda, acaoRemoverLegenda } from "@/lib/actions/legendas";
import { ALLOWLIST, atributoAccept, mimeDaExtensao } from "@/lib/armazenamento/regras";
import { processarLegenda, RE_IDIOMA } from "@/lib/legendas/regras";
import { formatarTempo } from "@/lib/validators/catalogo";

export interface LegendaEditor {
  id: string;
  idioma: string;
  rotulo: string;
  nomeOriginal: string;
  trechos: number;
  duracaoSeg: number;
  /** `updated_at` ISO (trava). */
  versao: string;
}

type Envio = { idioma: string; rotulo: string; substituir: { legendaId: string; versao: string } | null };

/**
 * Confere o arquivo NA TELA (mesmo parser do servidor: erro na hora, sem subir nada), sobe o bruto
 * direto ao storage e pede ao servidor a conversão. O servidor valida tudo de novo.
 */
function useEnviarLegenda(aulaId: string, duracaoSeg: number | null) {
  const router = useRouter();
  const envio = useEnvioDeArquivo("LEGENDA");
  const [pendente, iniciar] = useTransition();
  const enviar = async (arquivo: File, e: Envio): Promise<boolean> => {
    envio.setErro(null);
    try {
      processarLegenda(new Uint8Array(await arquivo.arrayBuffer()), duracaoSeg);
    } catch (x) {
      envio.setErro(x instanceof ErroDeNegocio ? x.message : "Arquivo de legenda inválido.");
      return false;
    }
    // O `type` do navegador para .srt varia: vale o da extensão (a allowlist confere os dois).
    const arquivoId = await envio.enviar(new File([arquivo], arquivo.name, { type: mimeDaExtensao("LEGENDA", arquivo.name) ?? arquivo.type }));
    if (!arquivoId) return false;
    return new Promise((resolver) =>
      iniciar(async () => {
        const r = await acaoEnviarLegenda({ aulaId, arquivoId, ...e });
        if (!r.ok) envio.setErro(r.erro);
        else router.refresh();
        resolver(r.ok);
      }),
    );
  };
  return { enviar, progresso: envio.progresso, ocupado: envio.enviando || pendente, erro: envio.erro };
}

function Erro({ texto }: { texto: string | null }) {
  return texto ? (
    <p role="alert" className="m-0 text-xs font-semibold text-warn">
      {texto}
    </p>
  ) : null;
}

function LinhaLegenda({ aulaId, duracaoSeg, legenda }: { aulaId: string; duracaoSeg: number | null; legenda: LegendaEditor }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const { enviar, progresso, ocupado, erro } = useEnviarLegenda(aulaId, duracaoSeg);
  const [remover, setRemover] = useState(false);
  const [erroRemover, setErroRemover] = useState<string | null>(null);
  const [removendo, iniciar] = useTransition();
  const trocar = async (arquivo: File | undefined) => {
    if (entrada.current) entrada.current.value = "";
    if (arquivo) await enviar(arquivo, { idioma: legenda.idioma, rotulo: legenda.rotulo, substituir: { legendaId: legenda.id, versao: legenda.versao } });
  };
  return (
    <li className="flex flex-col gap-2 border-t border-border py-2.5 first:border-t-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">
            {legenda.rotulo} <span className="font-normal text-muted">· {legenda.idioma}</span>
          </div>
          <div className="truncate text-xs text-muted">
            {legenda.trechos.toLocaleString("pt-BR")} {legenda.trechos === 1 ? "trecho" : "trechos"} · até {formatarTempo(legenda.duracaoSeg)} · {legenda.nomeOriginal}
          </div>
        </div>
        <MenuAdmin
          gatilho={<Button variant="fantasma" size="icone36" aria-label={`Ações da legenda ${legenda.rotulo}`} className="text-muted" carregando={ocupado} />}
          itens={[
            { rotulo: "Trocar arquivo", icone: <RefreshCw />, onSelecionar: () => entrada.current?.click() },
            {
              rotulo: "Remover",
              icone: <Trash2 />,
              perigo: true,
              onSelecionar: () => {
                setErroRemover(null);
                setRemover(true);
              },
            },
          ]}
        >
          <MoreVertical aria-hidden />
        </MenuAdmin>
        <input ref={entrada} type="file" accept={atributoAccept("LEGENDA")} className="sr-only" tabIndex={-1} aria-label={`Novo arquivo da legenda ${legenda.rotulo}`} onChange={(e) => trocar(e.target.files?.[0])} />
      </div>
      {progresso !== null && <BarraProgresso valor={progresso} rotulo="Enviando legenda" mostrarPercentual />}
      <Erro texto={erro ?? (remover ? null : erroRemover)} />
      <ModalConfirmacaoBlock
        aberto={remover}
        titulo="Remover legenda"
        mensagem={`A legenda "${legenda.rotulo}" (${legenda.idioma}) sai do player e da aba Transcrição. Fica no histórico (exclusão lógica).`}
        textoConfirmar="Remover"
        carregando={removendo}
        onCancelar={() => setRemover(false)}
        onConfirmar={() =>
          iniciar(async () => {
            const r = await acaoRemoverLegenda({ legendaId: legenda.id, versao: legenda.versao });
            setRemover(false);
            if (!r.ok) return setErroRemover(r.erro);
            router.refresh();
          })
        }
      />
    </li>
  );
}

function NovaLegenda({ aulaId, duracaoSeg, temPortugues }: { aulaId: string; duracaoSeg: number | null; temPortugues: boolean }) {
  const [idioma, setIdioma] = useState(temPortugues ? "" : "pt-BR");
  const [rotulo, setRotulo] = useState(temPortugues ? "" : "Português");
  const [erroCampos, setErroCampos] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const { enviar, progresso, ocupado, erro } = useEnviarLegenda(aulaId, duracaoSeg);
  const escolher = () => {
    if (!RE_IDIOMA.test(idioma.trim())) return setErroCampos("Idioma inválido. Use, por exemplo, pt-BR, en ou es.");
    if (!rotulo.trim()) return setErroCampos("Informe o nome da legenda no player.");
    setErroCampos(null);
    entrada.current?.click();
  };
  const aoEscolher = async (arquivo: File | undefined) => {
    if (entrada.current) entrada.current.value = "";
    if (arquivo && (await enviar(arquivo, { idioma: idioma.trim(), rotulo: rotulo.trim(), substituir: null }))) {
      setIdioma("");
      setRotulo("");
    }
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3.5">
      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2.5">
        <Campo rotulo="Idioma" value={idioma} onChange={(e) => setIdioma(e.target.value)} maxLength={10} tamanho="42" placeholder="en" spellCheck={false} />
        <Campo rotulo="Nome no player" value={rotulo} onChange={(e) => setRotulo(e.target.value)} maxLength={40} tamanho="42" placeholder="English" />
      </div>
      <input ref={entrada} type="file" accept={atributoAccept("LEGENDA")} className="sr-only" tabIndex={-1} aria-label="Arquivo da legenda" onChange={(e) => aoEscolher(e.target.files?.[0])} />
      {progresso !== null && <BarraProgresso valor={progresso} rotulo="Enviando legenda" mostrarPercentual />}
      <Button size="36" className="self-start" carregando={ocupado} onClick={escolher}>
        <FileUp className="size-3.5" aria-hidden />
        Enviar legenda
      </Button>
      <p className="m-0 text-xs text-muted">{ALLOWLIST.LEGENDA.descricao}. Formatação e tags são removidas: o aluno vê só o texto.</p>
      <Erro texto={erroCampos ?? erro} />
    </div>
  );
}

export interface LegendasAulaProps {
  aulaId: string;
  /** Duração do vídeo (confere se a legenda não passa do fim); nula = ainda sem vídeo. */
  duracaoSeg: number | null;
  legendas: LegendaEditor[];
}

/** Legendas da aula (RN-180): lista com trocar/remover e envio de um idioma novo. */
export function LegendasAula({ aulaId, duracaoSeg, legendas }: LegendasAulaProps) {
  return (
    <div className="flex flex-col gap-3">
      {legendas.length > 0 ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {legendas.map((l) => (
            <LinhaLegenda key={`${l.id}-${l.versao}`} aulaId={aulaId} duracaoSeg={duracaoSeg} legenda={l} />
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] text-muted">Nenhuma legenda nesta aula. O aluno vê o botão de legendas e a aba Transcrição quando houver uma.</p>
      )}
      <NovaLegenda key={legendas.length} aulaId={aulaId} duracaoSeg={duracaoSeg} temPortugues={legendas.some((l) => l.idioma === "pt-BR")} />
    </div>
  );
}
