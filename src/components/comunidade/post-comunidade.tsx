"use client";

import Link from "next/link";
import { useState } from "react";
import { EyeOff, MessageCircle, Share2 } from "lucide-react";
import { CartaoPost } from "@/components/engajamento/cartao-post";
import { AreaTexto } from "@/components/ui/area-texto";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { acaoEditarPublicacao } from "@/lib/actions/comunidade";
import type { PostDoFeed } from "@/lib/comunidade/consultas";
import { TEXTO_POST_MAX } from "@/lib/comunidade/regras";
import { cn } from "@/lib/utils";
import { BotaoCurtir } from "./botao-curtir";
import { AnexosPost, EnquetePost } from "./extras-post";
import { contagem, hrefDoPost, quando } from "./formatos";
import { MenuConteudo, type MudancaDoConteudo } from "./menu-conteudo";

export interface PostComunidadeProps {
  post: PostDoFeed;
  /** Membro da sessão (`null` = SUPER_ADMIN sem vínculo: só lê). */
  meuMembroId: string | null;
  /** Feed de todos os canais: mostra "# Canal" na meta. */
  mostrarCanal?: boolean;
  /** Post aberto: o contador vem dos comentários da página e não é link. */
  totalComentarios?: number;
  /** Removido: o feed tira da lista; o post aberto volta ao feed. */
  aoRemovido?: () => void;
}

type Aviso_ = { texto: string; tom: "ok" | "erro" } | null;

/** Post interativo: curtir otimista, enquete, anexos, compartilhar, editar e o ⋮ de moderação. */
export function PostComunidade({ post, meuMembroId, mostrarCanal, totalComentarios, aoRemovido }: PostComunidadeProps) {
  const [estado, setEstado] = useState({ texto: post.texto, editado: !!post.editadoEm, fixado: post.fixado, oculto: post.oculto, versao: post.versao });
  const [removido, setRemovido] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<Aviso_>(null);
  if (removido) return null;

  const participa = meuMembroId !== null;
  const mudar = (m: MudancaDoConteudo) =>
    setEstado((e) => ({ ...e, versao: m.versao, fixado: m.fixado ?? e.fixado, oculto: m.oculto === undefined ? e.oculto : m.oculto }));

  const salvar = async () => {
    if (editando === null) return;
    setSalvando(true);
    const r = await acaoEditarPublicacao({ postId: post.id, versao: estado.versao, texto: editando }).catch(() => null);
    setSalvando(false);
    if (!r?.ok) return setAviso({ texto: r?.erro ?? "Sem conexão com o servidor.", tom: "erro" });
    setEstado((e) => ({ ...e, texto: editando.trim(), editado: true, versao: r.dados.versao }));
    setEditando(null);
    setAviso(null);
  };

  const compartilhar = async () => {
    const url = new URL(hrefDoPost(post.id), window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      setAviso({ texto: "Link da publicação copiado.", tom: "ok" });
    } catch {
      setAviso({ texto: `Não foi possível copiar. Link: ${url}`, tom: "erro" });
    }
  };

  const comentarios = totalComentarios ?? post.comentarios;
  const classeAcao = "-mx-1.5 inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-1.5 transition-colors duration-150 hover:text-text";

  return (
    <CartaoPost
      autor={post.autor.nome}
      avatarSrc={post.autor.imagem}
      equipe={post.autor.equipe}
      quando={<time dateTime={new Date(post.criadoEm).toISOString()} suppressHydrationWarning>{quando(post.criadoEm)}</time>}
      canal={mostrarCanal ? { nome: post.canal.nome, href: `/comunidade?canal=${post.canal.id}` } : undefined}
      aula={post.aula ? { titulo: post.aula.titulo, href: `/aula/${post.aula.id}` } : undefined}
      editado={estado.editado}
      fixado={estado.fixado}
      texto={estado.texto}
      curtidas={post.curtidas}
      comentarios={comentarios}
      className={cn(estado.oculto && "border-dashed")}
      menu={
        <MenuConteudo
          alvo={{ postId: post.id }}
          rotulo={`publicação de ${post.autor.nome}`}
          versao={estado.versao}
          fixado={estado.fixado}
          oculto={!!estado.oculto}
          podeEditar={post.podeEditar && editando === null}
          podeRemover={post.podeRemover}
          podeModerar={post.podeModerar}
          podeDenunciar={participa && post.autor.membroId !== meuMembroId}
          aoEditar={() => setEditando(estado.texto)}
          aoRemovido={() => {
            setRemovido(true);
            aoRemovido?.();
          }}
          aoMudar={mudar}
          aoAviso={(texto, tom) => setAviso({ texto, tom })}
        />
      }
      corpo={
        editando !== null ? (
          <div className="flex flex-col gap-2">
            <AreaTexto rotulo="Editar publicação" rotuloOculto value={editando} onChange={(e) => setEditando(e.target.value)} maxLength={TEXTO_POST_MAX} rows={4} autoFocus />
            <div className="flex justify-end gap-2">
              <Button variant="contorno" size="36" onClick={() => setEditando(null)} disabled={salvando}>
                Cancelar
              </Button>
              <Button size="36" carregando={salvando} disabled={!editando.trim()} onClick={() => void salvar()}>
                Salvar
              </Button>
            </div>
          </div>
        ) : undefined
      }
      acoes={
        <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1 border-t border-border pt-3 text-[13px] text-muted">
          <BotaoCurtir alvo={{ postId: post.id }} curtiu={post.curtiu} curtidas={post.curtidas} desabilitado={!participa} />
          {totalComentarios === undefined ? (
            <Link href={hrefDoPost(post.id)} className={classeAcao}>
              <MessageCircle aria-hidden className="size-[15px]" />
              {contagem(comentarios, "comentário", "comentários")}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle aria-hidden className="size-[15px]" />
              {contagem(comentarios, "comentário", "comentários")}
            </span>
          )}
          <button type="button" onClick={() => void compartilhar()} className={cn(classeAcao, "ml-auto font-semibold text-accent hover:text-accent")}>
            <Share2 aria-hidden className="size-[15px]" />
            <span className="max-[430px]:sr-only">Compartilhar</span>
          </button>
        </div>
      }
    >
      {estado.oculto && (
        <p className="m-0 flex items-center gap-2 text-[13px] text-muted">
          <EyeOff aria-hidden className="size-4 shrink-0" />
          Oculto pela moderação{estado.oculto.motivo ? `: ${estado.oculto.motivo}` : ""}. Visível só para o autor e a equipe.
        </p>
      )}
      <AnexosPost anexos={post.anexos} />
      {post.enquete && <EnquetePost postId={post.id} inicial={post.enquete} podeVotar={participa} />}
      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
    </CartaoPost>
  );
}
