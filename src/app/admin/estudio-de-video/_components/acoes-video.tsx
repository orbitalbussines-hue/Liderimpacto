"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ExternalLink, MoreVertical, RefreshCw, Replace } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { acaoReprocessarVideo } from "@/lib/actions/videos";
import type { SituacaoVideo } from "@/lib/db/schema/_enums";
import { podeReprocessar } from "@/lib/video/regras";

export interface AcoesVideoProps {
  video: { id: string; nome: string; situacao: SituacaoVideo; aula: string };
  /** Editor da aula (onde o vídeo é enviado e trocado). */
  hrefAula: string;
}

/**
 * ⋮ da linha do estúdio: abrir a aula, trocar o vídeo (no editor da aula) e reprocessar
 * (ModalConfirmacaoBlock + a mesma action do editor). DONO e ADMIN; a action confere tudo.
 */
export function AcoesVideo({ video, hrefAula }: AcoesVideoProps) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const itens: ItemMenuAdmin[] = [
    { rotulo: "Abrir aula", icone: <ExternalLink />, href: hrefAula },
    { rotulo: "Trocar vídeo", icone: <Replace />, href: hrefAula },
  ];
  if (podeReprocessar(video.situacao)) itens.push({ rotulo: "Reprocessar", icone: <RefreshCw />, onSelecionar: () => setConfirmando(true) });

  return (
    <div className="flex justify-center">
      <MenuAdmin gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações do vídeo da aula ${video.aula}`} className="text-muted" />} itens={itens}>
        <MoreVertical aria-hidden />
      </MenuAdmin>
      <ModalConfirmacaoBlock
        aberto={confirmando}
        titulo="Reprocessar vídeo"
        mensagem={`"${video.nome}" (aula "${video.aula}") volta para a fila e é convertido de novo. Enquanto processa, os alunos não conseguem assistir a esta aula. Fica registrado na trilha.`}
        textoConfirmar="Reprocessar"
        carregando={pendente}
        onCancelar={() => setConfirmando(false)}
        onConfirmar={() =>
          iniciar(async () => {
            const r = await acaoReprocessarVideo({ videoId: video.id });
            setConfirmando(false);
            if (!r.ok) return setAviso({ titulo: "Não foi possível reprocessar", texto: r.erro });
            if (!r.dados.enfileirado) setAviso({ titulo: "Fila indisponível", texto: "O pedido foi gravado, mas a fila de processamento não respondeu. Tente “Reprocessar” de novo em instantes." });
            router.refresh();
          })
        }
      />
      <DialogoAdmin
        aberto={aviso !== null}
        onFechar={() => setAviso(null)}
        titulo={aviso?.titulo ?? ""}
        descricao={aviso?.texto}
        rodape={
          <Button size="42" onClick={() => setAviso(null)}>
            Entendi
          </Button>
        }
      />
    </div>
  );
}
