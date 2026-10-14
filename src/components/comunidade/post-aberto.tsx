"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import type { AutorPublico, ComentarioDaArvore, PostDoFeed } from "@/lib/comunidade/consultas";
import { Comentarios } from "./comentarios";
import { PostComunidade } from "./post-comunidade";

export interface PostAbertoProps {
  post: PostDoFeed;
  comentarios: readonly ComentarioDaArvore[];
  eu: AutorPublico | null;
  bloqueio: string | null;
}

/** `/comunidade?post=<id>`: o post e a conversa, com o contador acompanhando os comentários. */
export function PostAberto({ post, comentarios, eu, bloqueio }: PostAbertoProps) {
  const router = useRouter();
  const [total, setTotal] = useState(post.comentarios);
  return (
    <div className="flex flex-col gap-4">
      <PostComunidade post={post} meuMembroId={eu?.membroId ?? null} mostrarCanal totalComentarios={total} aoRemovido={() => router.push("/comunidade")} />
      <Cartao como="section" className="flex flex-col gap-4" aria-labelledby="titulo-comentarios">
        <CartaoTitulo id="titulo-comentarios" tamanho={15} como="h2">
          Comentários
        </CartaoTitulo>
        <Comentarios alvo={{ postId: post.id }} iniciais={comentarios} eu={eu} bloqueio={bloqueio} aoMudarTotal={(d) => setTotal((t) => Math.max(0, t + d))} />
      </Cartao>
    </div>
  );
}
