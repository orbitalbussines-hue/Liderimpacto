"use client";

import { useState } from "react";
import { EyeOff, Eye, Flag, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { acaoDenunciar, acaoRemoverComentario, acaoRemoverPublicacao } from "@/lib/actions/comunidade";
import { acaoFixarPublicacao, acaoOcultar } from "@/lib/actions/comunidade-moderacao";
import { DialogoMotivo } from "./dialogo-motivo";

export type AlvoConteudo = { postId: string } | { comentarioId: string };

export interface MudancaDoConteudo {
  versao: string;
  fixado?: boolean;
  oculto?: { motivo: string } | null;
}

export interface MenuConteudoProps {
  alvo: AlvoConteudo;
  /** "a publicação de Ana" — rótulo do botão para o leitor de tela. */
  rotulo: string;
  versao: string;
  /** Só post: `undefined` = sem a opção de fixar. */
  fixado?: boolean;
  oculto: boolean;
  podeEditar: boolean;
  podeRemover: boolean;
  podeModerar: boolean;
  podeDenunciar: boolean;
  aoEditar: () => void;
  aoRemovido: () => void;
  aoMudar: (m: MudancaDoConteudo) => void;
  aoAviso: (texto: string, tom: "ok" | "erro") => void;
}

/**
 * ⋮ de post e comentário: o autor edita/remove (remover pelo modal block), qualquer outro
 * denuncia com motivo, a equipe fixa (post) e oculta com motivo / reexibe. As regras de quem
 * pode vêm do servidor (`podeEditar`...); a action confere de novo.
 */
export function MenuConteudo(p: MenuConteudoProps) {
  const [dialogo, setDialogo] = useState<"remover" | "ocultar" | "denunciar" | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const ehPost = "postId" in p.alvo;
  const nome = ehPost ? "publicação" : "comentário";

  const fixar = async () => {
    if (!("postId" in p.alvo)) return;
    const r = await acaoFixarPublicacao({ postId: p.alvo.postId, versao: p.versao, fixar: !p.fixado }).catch(() => null);
    if (!r?.ok) return p.aoAviso(r?.erro ?? "Sem conexão com o servidor.", "erro");
    p.aoMudar({ versao: r.dados.versao, fixado: !p.fixado });
    p.aoAviso(p.fixado ? "Publicação desafixada." : "Publicação fixada.", "ok");
  };
  const reexibir = async () => {
    const r = await acaoOcultar({ ...p.alvo, versao: p.versao, ocultar: false }).catch(() => null);
    if (!r?.ok) return p.aoAviso(r?.erro ?? "Sem conexão com o servidor.", "erro");
    p.aoMudar({ versao: r.dados.versao, oculto: null });
  };
  const remover = async () => {
    setRemovendo(true);
    const { alvo, versao } = p;
    const r = await ("postId" in alvo ? acaoRemoverPublicacao({ postId: alvo.postId, versao }) : acaoRemoverComentario({ comentarioId: alvo.comentarioId, versao })).catch(() => null);
    setRemovendo(false);
    setDialogo(null);
    if (!r?.ok) return p.aoAviso(r?.erro ?? "Sem conexão com o servidor.", "erro");
    p.aoRemovido();
  };

  const candidatos: (ItemMenuAdmin | false)[] = [
    p.podeEditar && { rotulo: "Editar", icone: <Pencil />, onSelecionar: p.aoEditar },
    p.podeModerar && p.fixado !== undefined && { rotulo: p.fixado ? "Desafixar" : "Fixar no topo", icone: p.fixado ? <PinOff /> : <Pin />, onSelecionar: () => void fixar() },
    p.podeModerar && (p.oculto ? { rotulo: "Reexibir", icone: <Eye />, onSelecionar: () => void reexibir() } : { rotulo: "Ocultar", icone: <EyeOff />, onSelecionar: () => setDialogo("ocultar") }),
    p.podeDenunciar && { rotulo: "Denunciar", icone: <Flag />, onSelecionar: () => setDialogo("denunciar") },
    p.podeRemover && { rotulo: "Remover", icone: <Trash2 />, perigo: true, onSelecionar: () => setDialogo("remover") },
  ];
  const itens = candidatos.filter((i): i is ItemMenuAdmin => !!i);
  if (itens.length === 0) return null;

  return (
    <>
      <MenuAdmin gatilho={<Button variant="fantasma" size="icone36" aria-label={`Ações d${ehPost ? "a" : "o"} ${p.rotulo}`} className="text-muted" />} itens={itens}>
        <MoreHorizontal aria-hidden />
      </MenuAdmin>
      <ModalConfirmacaoBlock
        aberto={dialogo === "remover"}
        titulo={`Remover ${nome}?`}
        mensagem={ehPost ? "A publicação, os anexos e os comentários deixam de aparecer para todos." : "O comentário e as respostas a ele deixam de aparecer para todos."}
        textoConfirmar="Remover"
        carregando={removendo}
        onCancelar={() => setDialogo(null)}
        onConfirmar={() => void remover()}
      />
      <DialogoMotivo
        aberto={dialogo === "ocultar"}
        onFechar={() => setDialogo(null)}
        titulo={`Ocultar ${nome}`}
        descricao="Some para a turma; o autor e a equipe continuam vendo, com o motivo."
        placeholder="Ex.: fora do tema da comunidade"
        textoConfirmar="Ocultar"
        onConfirmar={async (motivo) => {
          const r = await acaoOcultar({ ...p.alvo, versao: p.versao, ocultar: true, motivo });
          if (!r.ok) return r.erro;
          p.aoMudar({ versao: r.dados.versao, oculto: { motivo } });
          return null;
        }}
      />
      <DialogoMotivo
        aberto={dialogo === "denunciar"}
        onFechar={() => setDialogo(null)}
        titulo={`Denunciar ${nome}`}
        descricao="A equipe recebe a denúncia e decide. Quem escreveu não sabe quem denunciou."
        placeholder="Conte o que há de errado"
        textoConfirmar="Enviar denúncia"
        onConfirmar={async (motivo) => {
          const r = await acaoDenunciar({ ...p.alvo, motivo });
          if (!r.ok) return r.erro;
          p.aoAviso("Denúncia enviada. A equipe vai analisar.", "ok");
          return null;
        }}
      />
    </>
  );
}
