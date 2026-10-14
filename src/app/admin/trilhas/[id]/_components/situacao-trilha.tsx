"use client";

import { Eye, EyeOff, Trash2 } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { CartaoTitulo } from "@/components/ui/cartao";
import { Selo } from "@/components/ui/selo";
import { useAcoesTrilha, type TrilhaAcionavel } from "../../_components/use-acoes-trilha";

/** Painel lateral do editor: situação, publicar/despublicar e remover (modal block). */
export function SituacaoTrilha({ trilha, publicadaEm }: { trilha: TrilhaAcionavel; publicadaEm: string | null }) {
  const a = useAcoesTrilha(trilha, "/admin/trilhas");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <CartaoTitulo tamanho={15} como="h2">
          Situação
        </CartaoTitulo>
        <Selo tom={a.publicada ? "ok" : "neutro"}>{a.publicada ? "Publicada" : "Rascunho"}</Selo>
      </div>
      <p className="m-0 text-[13px] leading-relaxed text-muted">
        {a.publicada
          ? `Visível na tela Trilhas e na vitrine para quem tem matrícula em ao menos um curso dela${publicadaEm ? ` (desde ${publicadaEm})` : ""}.`
          : "Só a equipe vê. Publique quando as etapas estiverem na ordem certa."}
      </p>
      {!a.publicada && trilha.etapas === 0 && <Aviso tom="info">Para publicar, adicione ao menos 1 etapa.</Aviso>}
      {a.erro && <Aviso tom="erro">{a.erro}</Aviso>}
      <div className="flex flex-wrap gap-2.5">
        <Button size="42" variant={a.publicada ? "contorno" : "primario"} disabled={!a.publicada && trilha.etapas === 0} onClick={a.abrirSituacao}>
          {a.publicada ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          {a.publicada ? "Despublicar" : "Publicar"}
        </Button>
        <Button size="42" variant="perigo" onClick={a.abrirRemover}>
          <Trash2 aria-hidden />
          Remover
        </Button>
      </div>
      {a.modais}
    </div>
  );
}
