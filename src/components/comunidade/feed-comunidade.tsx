"use client";

import { useState } from "react";
import { MessagesSquare } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { acaoMaisPublicacoes } from "@/lib/actions/comunidade";
import type { PaginaDoFeed } from "@/lib/comunidade/consultas";
import type { OrdemFeed } from "@/lib/comunidade/regras";
import { PostComunidade } from "./post-comunidade";

export interface FeedComunidadeProps {
  inicial: PaginaDoFeed;
  canalId: string | null;
  ordem: OrdemFeed;
  meuMembroId: string | null;
}

/**
 * Lista do feed com "Carregar mais" por cursor (action de leitura). A página troca a `key` deste
 * componente quando o feed muda no servidor (post novo, outro canal/ordem): o estado recomeça.
 */
export function FeedComunidade({ inicial, canalId, ordem, meuMembroId }: FeedComunidadeProps) {
  const [itens, setItens] = useState(inicial.itens);
  const [cursor, setCursor] = useState(inicial.proximoCursor);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregarMais = async () => {
    setCarregando(true);
    setErro(null);
    const r = await acaoMaisPublicacoes({ canalId, ordem, cursor }).catch(() => null);
    setCarregando(false);
    if (!r?.ok) return setErro(r?.erro ?? "Sem conexão com o servidor. Tente de novo.");
    const vistos = new Set(itens.map((p) => p.id));
    setItens((l) => [...l, ...r.dados.itens.filter((p) => !vistos.has(p.id))]);
    setCursor(r.dados.proximoCursor);
  };

  if (itens.length === 0)
    return <EstadoVazio comMoldura icone={<MessagesSquare />} titulo="Nenhuma publicação por aqui" descricao="Quando alguém publicar neste canal, aparece aqui." />;

  return (
    <div className="flex flex-col gap-4">
      {itens.map((p) => (
        <PostComunidade key={p.id} post={p} meuMembroId={meuMembroId} mostrarCanal={!canalId} />
      ))}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {cursor && (
        <Button variant="contorno" className="self-center" carregando={carregando} onClick={() => void carregarMais()}>
          Carregar mais
        </Button>
      )}
    </div>
  );
}
