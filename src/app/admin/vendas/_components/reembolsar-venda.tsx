"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MoreVertical, Undo2 } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { acaoReembolsarVenda } from "@/lib/actions/pagamentos";
import { formatarCentavos } from "@/lib/pagamentos/regras";

export interface VendaReembolsavel {
  id: string;
  versao: string;
  comprador: string;
  oferta: string;
  /** O que ainda volta ao comprador (valor − já reembolsado no Dashboard). */
  restanteCentavos: number;
  assinatura: boolean;
}

/** Menu "⋮" com "Reembolsar" (só DONO, RN-216): ModalConfirmacaoBlock de 3 s; a action confere papel, criador e versão. */
export function ReembolsarVenda({ venda: v }: { venda: VendaReembolsavel }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const confirmar = () =>
    iniciar(async () => {
      const r = await acaoReembolsarVenda({ vendaId: v.id, versao: v.versao }).catch(() => null);
      setAberto(false);
      if (!r) return setAviso({ tom: "erro", texto: "Sem conexão com o servidor. Tente de novo." });
      if (!r.ok) return setAviso({ tom: "erro", texto: r.erro });
      const n = r.dados.matriculasCanceladas;
      setAviso({ tom: "ok", texto: `Reembolso pedido ao Stripe. ${n === 0 ? "Nenhuma matrícula precisou ser cancelada." : n === 1 ? "1 matrícula cancelada." : `${n} matrículas canceladas.`}` });
      router.refresh();
    });

  return (
    <>
      <div className="flex justify-center">
        <MenuAdmin
          gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações da venda de ${v.comprador}`} className="text-muted" />}
          itens={[{ rotulo: "Reembolsar", icone: <Undo2 />, perigo: true, onSelecionar: () => setAberto(true) }]}
        >
          <MoreVertical aria-hidden />
        </MenuAdmin>
      </div>
      <ModalConfirmacaoBlock
        aberto={aberto}
        titulo="Reembolsar venda"
        mensagem={
          `Devolve ${formatarCentavos(v.restanteCentavos)} a ${v.comprador} (${v.oferta}) pelo Stripe — reembolso total. ` +
          "A taxa da plataforma volta na mesma proporção e o acesso aos cursos desta venda é cancelado." +
          (v.assinatura ? " A assinatura também é cancelada no Stripe." : "") +
          " Não dá para desfazer."
        }
        textoConfirmar="Reembolsar"
        carregando={pendente}
        onCancelar={() => setAberto(false)}
        onConfirmar={confirmar}
      />
      <DialogoAdmin
        aberto={aviso !== null}
        onFechar={() => setAviso(null)}
        titulo={aviso?.tom === "ok" ? "Reembolso feito" : "Não foi possível reembolsar"}
        rodape={
          <Button size="42" onClick={() => setAviso(null)}>
            Entendi
          </Button>
        }
      >
        {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
      </DialogoAdmin>
    </>
  );
}
