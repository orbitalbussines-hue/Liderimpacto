"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ExternalLink, MoreVertical, Percent, Power } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { acaoAlterarSituacaoCriador } from "@/lib/actions/criadores";
import type { StatusCriador } from "@/lib/db/schema/_enums";
import { MudarTaxa } from "./mudar-taxa";

export interface AcoesCriadorProps {
  criador: { id: string; nome: string; status: StatusCriador; versao: string; url: string; taxaBps: number };
}

/** Menu da linha do criador: abrir a área, mudar a taxa da plataforma e suspender/reativar (modal block). */
export function AcoesCriador({ criador }: AcoesCriadorProps) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [mudandoTaxa, setMudandoTaxa] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const suspenso = criador.status === "SUSPENSO";
  const alterar = () =>
    iniciar(async () => {
      const r = await acaoAlterarSituacaoCriador({ criadorId: criador.id, status: suspenso ? "ATIVO" : "SUSPENSO", versao: criador.versao });
      setConfirmando(false);
      if (!r.ok) return setErro(r.erro);
      router.refresh();
    });
  return (
    <div className="flex justify-center">
      <MenuAdmin
        gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações de ${criador.nome}`} className="text-muted" />}
        itens={[
          ...(suspenso ? [] : [{ rotulo: "Abrir área", icone: <ExternalLink />, onSelecionar: () => window.open(`${criador.url}/admin`, "_blank", "noopener") }]),
          { rotulo: "Mudar taxa", icone: <Percent />, onSelecionar: () => setMudandoTaxa(true) },
          { rotulo: suspenso ? "Reativar" : "Suspender", icone: <Power />, perigo: !suspenso, onSelecionar: () => setConfirmando(true) },
        ]}
      >
        <MoreVertical aria-hidden />
      </MenuAdmin>
      {mudandoTaxa && (
        <MudarTaxa
          criador={criador}
          onFechar={(mudou) => {
            setMudandoTaxa(false);
            if (mudou) router.refresh();
          }}
        />
      )}
      <ModalConfirmacaoBlock
        aberto={confirmando}
        titulo={suspenso ? "Reativar criador" : "Suspender criador"}
        mensagem={
          suspenso
            ? `A área de ${criador.nome} volta a abrir para a equipe e os alunos.`
            : `A área de ${criador.nome} sai do ar (endereço responde "não encontrado") e quem estiver lá perde o acesso na próxima página. Nada é apagado; dá para reativar.`
        }
        textoConfirmar={suspenso ? "Reativar" : "Suspender"}
        carregando={pendente}
        onCancelar={() => setConfirmando(false)}
        onConfirmar={alterar}
      />
      <DialogoAdmin
        aberto={erro !== null}
        onFechar={() => setErro(null)}
        titulo="Não foi possível concluir"
        descricao={erro}
        rodape={
          <Button size="42" onClick={() => setErro(null)}>
            Entendi
          </Button>
        }
      />
    </div>
  );
}
