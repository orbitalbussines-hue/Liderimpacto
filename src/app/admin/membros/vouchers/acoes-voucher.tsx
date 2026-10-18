"use client";

import { useState } from "react";
import { Ban, History, MoreVertical, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { acaoExcluirVoucher, acaoMudarSituacaoVoucher } from "@/lib/actions/vouchers";
import type { SituacaoVoucher } from "@/lib/db/schema/_enums";
import { useAcao } from "../_components/use-acao";
import type { CamposVoucher } from "./campos";
import { FormVoucher, type ProdutoDoVoucher } from "./form-voucher";

export interface AcoesVoucherProps {
  voucher: { id: string; codigo: string; situacao: SituacaoVoucher; usos: number; versao: string; campos: CamposVoucher };
  produtos: readonly ProdutoDoVoucher[];
}

type Critica = "encerrar" | "excluir" | null;

/**
 * Menu da linha: editar, resgates, pausar/reativar, encerrar (final) e excluir (só sem resgates).
 * Encerrar e excluir passam pelo ModalConfirmacaoBlock. Esconder item é conforto: a action confere.
 */
export function AcoesVoucher({ voucher, produtos }: AcoesVoucherProps) {
  const [editando, setEditando] = useState(false);
  const [critica, setCritica] = useState<Critica>(null);
  const { erro, setErro, pendente, rodar } = useAcao();
  const codigo = voucher.codigo;
  const situacao = (s: SituacaoVoucher) => () => acaoMudarSituacaoVoucher({ voucherId: voucher.id, versao: voucher.versao, situacao: s });
  const fechar = () => {
    setCritica(null);
    setErro(null);
  };

  const encerrado = voucher.situacao === "ENCERRADO";
  const itens: ItemMenuAdmin[] = [];
  if (!encerrado) itens.push({ rotulo: "Editar", icone: <Pencil />, onSelecionar: () => setEditando(true) });
  itens.push({ rotulo: "Ver resgates", icone: <History />, href: `/admin/membros/vouchers/${voucher.id}` });
  if (voucher.situacao === "ATIVO") itens.push({ rotulo: "Pausar", icone: <Pause />, onSelecionar: () => rodar(situacao("PAUSADO"), () => undefined) });
  if (voucher.situacao === "PAUSADO") itens.push({ rotulo: "Reativar", icone: <Play />, onSelecionar: () => rodar(situacao("ATIVO"), () => undefined) });
  if (!encerrado) itens.push({ rotulo: "Encerrar", icone: <Ban />, perigo: true, onSelecionar: () => setCritica("encerrar") });
  if (voucher.usos === 0) itens.push({ rotulo: "Excluir", icone: <Trash2 />, perigo: true, onSelecionar: () => setCritica("excluir") });

  return (
    <div className="flex justify-center">
      <MenuAdmin gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações do voucher ${codigo}`} className="text-muted" />} itens={itens}>
        <MoreVertical aria-hidden />
      </MenuAdmin>
      {editando && (
        <FormVoucher
          voucher={{ id: voucher.id, codigo, versao: voucher.versao, campos: voucher.campos }}
          produtos={produtos}
          onFechar={() => setEditando(false)}
        />
      )}
      <ModalConfirmacaoBlock
        aberto={critica !== null && erro === null}
        titulo={critica === "excluir" ? "Excluir voucher" : "Encerrar voucher"}
        mensagem={
          critica === "excluir"
            ? `${codigo} sai da lista (exclusão lógica, fica na trilha). Ninguém resgatou este código.`
            : `${codigo} deixa de valer para sempre (não volta a ativo). Quem já resgatou continua com as matrículas. Para suspender por um tempo, use Pausar.`
        }
        textoConfirmar={critica === "excluir" ? "Excluir" : "Encerrar"}
        carregando={pendente}
        onCancelar={fechar}
        onConfirmar={() =>
          rodar(critica === "excluir" ? () => acaoExcluirVoucher({ voucherId: voucher.id, versao: voucher.versao }) : situacao("ENCERRADO"), fechar)
        }
      />
      <DialogoAdmin
        aberto={erro !== null && !editando}
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
