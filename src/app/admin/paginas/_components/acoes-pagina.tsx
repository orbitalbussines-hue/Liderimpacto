"use client";

import { useState } from "react";
import { Copy, ExternalLink, EyeOff, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { MenuAdmin, type ItemMenuAdmin } from "@/components/admin/menu-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Button } from "@/components/ui/button";
import { useAcao } from "@/app/admin/membros/_components/use-acao";
import { acaoDespublicarPagina, acaoExcluirPagina } from "@/lib/actions/paginas";
import type { SituacaoPagina } from "@/lib/db/schema/_enums";

/** Menu da linha: editar, ver no ar, copiar link, tirar do ar e excluir (as duas últimas com o modal block). */
export function AcoesPagina({ pagina, url }: { pagina: { id: string; titulo: string; situacao: SituacaoPagina; versao: string }; url: string }) {
  const [confirmar, setConfirmar] = useState<"tirar" | "excluir" | null>(null);
  const [copiado, setCopiado] = useState(false);
  const { erro, setErro, pendente, rodar } = useAcao();
  const fechar = () => {
    setConfirmar(null);
    setErro(null);
  };
  const copiar = () =>
    void navigator.clipboard.writeText(url).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  const itens: ItemMenuAdmin[] = [
    { rotulo: "Editar", icone: <Pencil />, href: `/admin/paginas/${pagina.id}` },
    ...(pagina.situacao === "PUBLICADA"
      ? [
          { rotulo: "Ver no ar", icone: <ExternalLink />, onSelecionar: () => window.open(url, "_blank", "noopener") },
          { rotulo: copiado ? "Link copiado" : "Copiar link", icone: <Copy />, onSelecionar: copiar },
          { rotulo: "Tirar do ar", icone: <EyeOff />, onSelecionar: () => setConfirmar("tirar") },
        ]
      : []),
    { rotulo: "Excluir", icone: <Trash2 />, perigo: true, onSelecionar: () => setConfirmar("excluir") },
  ];
  const entrada = { paginaId: pagina.id, versao: pagina.versao };
  const tirar = confirmar === "tirar";
  return (
    <div className="flex justify-center">
      <MenuAdmin gatilho={<Button variant="fantasma" size="icone44" aria-label={`Ações da página ${pagina.titulo}`} className="text-muted" />} itens={itens}>
        <MoreVertical aria-hidden />
      </MenuAdmin>
      <span role="status" className="sr-only">
        {copiado ? "Link copiado" : ""}
      </span>
      <ModalConfirmacaoBlock
        aberto={confirmar !== null && erro === null}
        titulo={tirar ? `Tirar "${pagina.titulo}" do ar?` : `Excluir "${pagina.titulo}"?`}
        mensagem={
          tirar
            ? "Quem abrir o endereço passa a ver “página não encontrada”. O conteúdo fica guardado e pode ser publicado de novo."
            : "A página sai da lista e o endereço fica livre. Leads e métricas já registrados continuam guardados."
        }
        textoConfirmar={tirar ? "Tirar do ar" : "Excluir"}
        carregando={pendente}
        onCancelar={fechar}
        onConfirmar={() => rodar(() => (tirar ? acaoDespublicarPagina(entrada) : acaoExcluirPagina(entrada)), fechar)}
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
