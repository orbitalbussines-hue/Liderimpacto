"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BarChart3, Ban, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { acaoCancelarCampanha, acaoExcluirCampanha } from "@/lib/actions/campanhas";
import type { SituacaoCampanha } from "@/lib/db/schema/_enums";
import { campanhaCancelavel, campanhaEditavel } from "@/lib/marketing/regras";
import { useAcao } from "../../membros/_components/use-acao";

export interface AcoesCampanhaProps {
  campanha: { id: string; nome: string; situacao: SituacaoCampanha; versao: string };
  /** Na tela de detalhe: excluir volta para a lista e "Ver resultado" some. */
  noDetalhe?: boolean;
}

type Critica = "cancelar" | "excluir" | null;

/** Menu da campanha: editar (rascunho/agendada), ver resultado, cancelar (agendada/enviando) e excluir (só rascunho). */
export function AcoesCampanha({ campanha, noDetalhe = false }: AcoesCampanhaProps) {
  const router = useRouter();
  const [critica, setCritica] = useState<Critica>(null);
  const { erro, setErro, pendente, rodar } = useAcao();
  const alvo = { campanhaId: campanha.id, versao: campanha.versao };
  const fechar = () => {
    setCritica(null);
    setErro(null);
  };

  const itens: ItemMenuAdmin[] = [];
  if (campanhaEditavel(campanha.situacao)) itens.push({ rotulo: "Editar", icone: <Pencil />, href: `/admin/campanhas/${campanha.id}/editar` });
  if (!noDetalhe) itens.push({ rotulo: "Ver resultado", icone: <BarChart3 />, href: `/admin/campanhas/${campanha.id}` });
  if (campanhaCancelavel(campanha.situacao)) itens.push({ rotulo: "Cancelar envio", icone: <Ban />, perigo: true, onSelecionar: () => setCritica("cancelar") });
  if (campanha.situacao === "RASCUNHO") itens.push({ rotulo: "Excluir rascunho", icone: <Trash2 />, perigo: true, onSelecionar: () => setCritica("excluir") });

  return (
    <div className="flex justify-center">
      <MenuAdmin gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações da campanha ${campanha.nome}`} className="text-muted" />} itens={itens}>
        <MoreVertical aria-hidden />
      </MenuAdmin>
      <ModalConfirmacaoBlock
        aberto={critica !== null && erro === null}
        titulo={critica === "excluir" ? "Excluir rascunho" : "Cancelar envio"}
        mensagem={
          critica === "excluir"
            ? `"${campanha.nome}" sai da lista. Nada foi enviado.`
            : `"${campanha.nome}" para de sair: quem ainda não recebeu não recebe mais. O que já foi enviado não volta. Não dá para desfazer.`
        }
        textoConfirmar={critica === "excluir" ? "Excluir" : "Cancelar envio"}
        carregando={pendente}
        onCancelar={fechar}
        onConfirmar={() =>
          critica === "excluir"
            ? rodar(
                () => acaoExcluirCampanha(alvo),
                () => {
                  fechar();
                  if (noDetalhe) router.push("/admin/campanhas");
                },
              )
            : rodar(() => acaoCancelarCampanha(alvo), fechar)
        }
      />
      <DialogoAdmin
        aberto={erro !== null}
        onFechar={fechar}
        titulo="Não foi possível concluir"
        descricao={erro}
        rodape={
          <Button size="42" onClick={fechar}>
            Entendi
          </Button>
        }
      />
    </div>
  );
}
