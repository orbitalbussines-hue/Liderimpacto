"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ExternalLink, FileUp, Link2, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { MenuAdmin } from "@/components/admin/menu-admin";
import { useEnvioDeArquivo } from "@/components/admin/use-envio-arquivo";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { CampoMoldura } from "@/components/ui/campo-moldura";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { IconeQuadrado } from "@/components/ui/icone-quadrado";
import { DialogoTitulo } from "@/app/admin/conteudos/[id]/_components/dialogo-titulo";
import type { Resultado } from "@/lib/acao";
import { acaoAdicionarMaterial, acaoLinkDoMaterial, acaoRemoverMaterial, acaoRenomearMaterial } from "@/lib/actions/aulas";
import { ALLOWLIST, atributoAccept, formatarTamanho } from "@/lib/armazenamento/regras";
import type { TipoMaterial } from "@/lib/db/schema/_enums";

export interface MaterialDaAula {
  id: string;
  nome: string;
  tipo: TipoMaterial;
  url: string | null;
  arquivoNome: string | null;
  arquivoTamanho: number | null;
  versao: string;
}

function LinhaMaterial({ material }: { material: MaterialDaAula }) {
  const router = useRouter();
  const [dialogo, setDialogo] = useState<"renomear" | "remover" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (acao: () => Promise<Resultado<unknown>>) =>
    iniciar(async () => {
      setErro(null);
      const r = await acao();
      if (!r.ok) return setErro(r.erro);
      setDialogo(null);
      router.refresh();
    });
  const abrirDialogo = (d: "renomear" | "remover") => {
    setErro(null);
    setDialogo(d);
  };
  const abrir = () =>
    iniciar(async () => {
      const r = await acaoLinkDoMaterial({ materialId: material.id });
      if (!r.ok) return setErro(r.erro);
      window.open(r.dados.url, "_blank", "noopener,noreferrer");
    });
  const detalhe = material.url ?? (material.arquivoNome ? `${material.arquivoNome} · ${formatarTamanho(material.arquivoTamanho ?? 0)}` : "");
  return (
    <li className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0">
      <IconeQuadrado tamanho={32} tom={material.tipo === "LINK" ? "neutro" : "accent"}>
        {material.tipo === "LINK" ? <Link2 /> : <span className="text-[10px] font-extrabold">{material.tipo}</span>}
      </IconeQuadrado>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold">{material.nome}</div>
        <div className="truncate text-xs text-muted">{detalhe}</div>
        {erro && dialogo === null && (
          <span role="alert" className="block text-xs font-semibold text-warn">
            {erro}
          </span>
        )}
      </div>
      <MenuAdmin
        gatilho={<Button variant="fantasma" size="icone36" aria-label={`Ações do material ${material.nome}`} className="text-muted" />}
        itens={[
          material.url ? { rotulo: "Abrir link", icone: <ExternalLink />, onSelecionar: () => window.open(material.url!, "_blank", "noopener,noreferrer") } : { rotulo: "Abrir arquivo", icone: <ExternalLink />, onSelecionar: abrir },
          { rotulo: "Renomear", icone: <Pencil />, onSelecionar: () => abrirDialogo("renomear") },
          { rotulo: "Remover", icone: <Trash2 />, perigo: true, onSelecionar: () => abrirDialogo("remover") },
        ]}
      >
        <MoreVertical aria-hidden />
      </MenuAdmin>
      <DialogoTitulo
        aberto={dialogo === "renomear"}
        onFechar={() => setDialogo(null)}
        titulo="Renomear material"
        rotuloCampo="Nome"
        inicial={material.nome}
        textoSalvar="Salvar"
        carregando={pendente}
        erro={erro}
        onSalvar={(nome) => rodar(() => acaoRenomearMaterial({ materialId: material.id, versao: material.versao, nome }))}
      />
      <ModalConfirmacaoBlock
        aberto={dialogo === "remover"}
        titulo="Remover material"
        mensagem={`"${material.nome}" sai da aula (exclusão lógica, fica na trilha).${material.arquivoNome ? " O arquivo é apagado do armazenamento." : ""}`}
        textoConfirmar="Remover"
        carregando={pendente}
        onCancelar={() => setDialogo(null)}
        onConfirmar={() => rodar(() => acaoRemoverMaterial({ materialId: material.id, versao: material.versao }))}
      />
    </li>
  );
}

/** Novo material: arquivo (PDF/DOC até 50 MB, direto ao storage) ou link https. */
function NovoMaterial({ aulaId }: { aulaId: string }) {
  const router = useRouter();
  const [origem, setOrigem] = useState<"ARQUIVO" | "LINK">("ARQUIVO");
  const [nome, setNome] = useState("");
  const [url, setUrl] = useState("");
  const entrada = useRef<HTMLInputElement>(null);
  const { enviar, progresso, enviando, erro, setErro } = useEnvioDeArquivo("MATERIAL");
  const [pendente, iniciar] = useTransition();
  const concluir = (r: Resultado<unknown>) => {
    if (!r.ok) return setErro(r.erro);
    setNome("");
    setUrl("");
    router.refresh();
  };
  const escolher = async (arquivo: File | undefined) => {
    if (entrada.current) entrada.current.value = "";
    if (!arquivo) return;
    const arquivoId = await enviar(arquivo);
    if (!arquivoId) return;
    const nomeFinal = nome.trim() || arquivo.name.replace(/\.[^.]+$/, "");
    iniciar(async () => concluir(await acaoAdicionarMaterial({ aulaId, nome: nomeFinal, arquivoId })));
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3.5">
      <CampoMoldura id={`origem-${aulaId}`} rotulo="Novo material">
        <GrupoChips
          id={`origem-${aulaId}`}
          aria-labelledby={`origem-${aulaId}-rotulo`}
          opcoes={[
            { valor: "ARQUIVO", rotulo: "Arquivo" },
            { valor: "LINK", rotulo: "Link" },
          ]}
          valor={origem}
          onMudar={(v) => {
            setOrigem(v);
            setErro(null);
          }}
        />
      </CampoMoldura>
      <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={160} tamanho="42" placeholder={origem === "ARQUIVO" ? "Vazio = nome do arquivo" : "Ex.: Artigo de apoio"} />
      {origem === "LINK" ? (
        <>
          <Campo rotulo="Link" type="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={2000} tamanho="42" placeholder="https://" />
          <Button size="36" className="self-start" carregando={pendente} onClick={() => iniciar(async () => concluir(await acaoAdicionarMaterial({ aulaId, nome, url })))}>
            <Link2 className="size-3.5" aria-hidden />
            Adicionar link
          </Button>
        </>
      ) : (
        <>
          <input ref={entrada} type="file" accept={atributoAccept("MATERIAL")} className="sr-only" tabIndex={-1} aria-label="Arquivo do material" onChange={(e) => escolher(e.target.files?.[0])} />
          {progresso !== null && <BarraProgresso valor={progresso} rotulo="Enviando material" mostrarPercentual />}
          <Button size="36" className="self-start" carregando={enviando || pendente} onClick={() => entrada.current?.click()}>
            <FileUp className="size-3.5" aria-hidden />
            Escolher arquivo
          </Button>
          <p className="m-0 text-xs text-muted">{ALLOWLIST.MATERIAL.descricao}</p>
        </>
      )}
      {erro && (
        <p role="alert" className="m-0 text-xs font-semibold text-warn">
          {erro}
        </p>
      )}
    </div>
  );
}

export interface MateriaisAulaProps {
  aulaId: string;
  materiais: MaterialDaAula[];
}

/** Materiais da aula: lista (abrir, renomear, remover) e inclusão de arquivo ou link. */
export function MateriaisAula({ aulaId, materiais }: MateriaisAulaProps) {
  return (
    <div className="flex flex-col gap-3">
      {materiais.length > 0 ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {materiais.map((m) => (
            <LinhaMaterial key={m.id} material={m} />
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] text-muted">Nenhum material nesta aula.</p>
      )}
      <NovoMaterial aulaId={aulaId} />
    </div>
  );
}
