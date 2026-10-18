"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { useAcao } from "@/app/admin/membros/_components/use-acao";
import { acaoExcluirFunil } from "@/lib/actions/paginas";
import type { EtapaFunil } from "@/lib/db/schema/paginas";
import { FormFunil, type PaginaOpcao } from "./form-funil";

export function NovoFunil({ paginas }: { paginas: readonly PaginaOpcao[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button size="36" onClick={() => setAberto(true)}>
        <Plus className="size-3.5" aria-hidden />
        Novo funil
      </Button>
      {aberto && <FormFunil paginas={paginas} onFechar={() => setAberto(false)} />}
    </>
  );
}

export function CopiarEntrada({ url }: { url: string | null }) {
  const [copiado, setCopiado] = useState(false);
  if (!url) return null;
  return (
    <>
      <Button
        variant="contorno"
        size="40"
        title={url}
        onClick={() =>
          void navigator.clipboard.writeText(url).then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          })
        }
      >
        {copiado ? <Check className="text-ok" aria-hidden /> : <Copy aria-hidden />}
        {copiado ? "Copiado" : "Copiar link de entrada"}
      </Button>
      <span role="status" className="sr-only">
        {copiado ? "Link copiado" : ""}
      </span>
    </>
  );
}

/** Editar e excluir o funil (excluir com o modal block; métricas e leads ficam no histórico). */
export function AcoesFunil({ funil, paginas }: { funil: { id: string; nome: string; versao: string; etapas: EtapaFunil[] }; paginas: readonly PaginaOpcao[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const { erro, setErro, pendente, rodar } = useAcao();
  const fechar = () => {
    setExcluindo(false);
    setErro(null);
  };
  return (
    <>
      <Button variant="contorno" size="40" onClick={() => setEditando(true)}>
        <Pencil aria-hidden />
        Editar etapas
      </Button>
      <MenuAdmin gatilho={<Button variant="contorno" size="icone36" className="size-10" aria-label={`Mais ações do funil ${funil.nome}`} />} itens={[{ rotulo: "Excluir funil", icone: <Trash2 />, perigo: true, onSelecionar: () => setExcluindo(true) }]}>
        <MoreVertical aria-hidden />
      </MenuAdmin>
      {editando && <FormFunil paginas={paginas} funil={funil} onFechar={() => setEditando(false)} />}
      <ModalConfirmacaoBlock
        aberto={excluindo && erro === null}
        titulo={`Excluir o funil "${funil.nome}"?`}
        mensagem="O funil sai da lista. As páginas continuam no ar; visitas, leads e vendas já registrados ficam guardados."
        textoConfirmar="Excluir"
        carregando={pendente}
        onCancelar={fechar}
        onConfirmar={() => rodar(() => acaoExcluirFunil({ funilId: funil.id, versao: funil.versao }), () => router.push("/admin/funis"))}
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
    </>
  );
}
