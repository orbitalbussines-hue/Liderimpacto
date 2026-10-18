"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { Selecao } from "@/components/ui/selecao";
import { acaoCriarFunil, acaoSalvarFunil } from "@/lib/actions/paginas";
import type { EtapaFunil } from "@/lib/db/schema/paginas";
import { ListaItens } from "@/app/admin/paginas/[id]/_components/campos";

export interface PaginaOpcao {
  id: string;
  titulo: string;
  situacao: string;
}

const NOMES_PADRAO = ["Captura", "Página de vendas", "Obrigado"];

/** Criar/editar funil: nome e etapas em ordem (cada etapa = uma página desta área). */
export function FormFunil({ paginas, funil, onFechar }: { paginas: readonly PaginaOpcao[]; funil?: { id: string; nome: string; versao: string; etapas: EtapaFunil[] }; onFechar: () => void }) {
  const router = useRouter();
  const [nome, setNome] = useState(funil?.nome ?? "");
  const [etapas, setEtapas] = useState<EtapaFunil[]>(funil?.etapas ?? paginas.slice(0, 2).map((p, i) => ({ paginaId: p.id, nome: NOMES_PADRAO[i] ?? `Etapa ${i + 1}` })));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const salvar = () =>
    iniciar(async () => {
      const r = funil ? await acaoSalvarFunil({ funilId: funil.id, versao: funil.versao, nome, etapas }) : await acaoCriarFunil({ nome, etapas });
      if (!r.ok) return setErro(r.erro);
      onFechar();
      if (!funil && "id" in r.dados) router.push(`/admin/funis/${r.dados.id}`);
      else router.refresh();
    });
  const opcoes = paginas.map((p) => ({ valor: p.id, rotulo: `${p.titulo}${p.situacao === "PUBLICADA" ? "" : " (fora do ar)"}` }));
  return (
    <DialogoAdmin
      aberto
      onFechar={onFechar}
      titulo={funil ? "Editar funil" : "Novo funil"}
      descricao="O visitante entra pela primeira etapa; o formulário de captura leva à próxima. Cada etapa mede visitas, leads, cliques no pagamento e vendas."
      rodape={
        <>
          <Button variant="contorno" size="42" onClick={onFechar}>
            Cancelar
          </Button>
          <Button size="42" carregando={pendente} disabled={!paginas.length} onClick={salvar}>
            {funil ? "Salvar" : "Criar funil"}
          </Button>
        </>
      }
    >
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
        {!paginas.length && <Aviso tom="info">Crie uma página antes de montar o funil.</Aviso>}
        <Campo rotulo="Nome do funil" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} />
        <ListaItens
          rotulo="Etapas"
          itens={etapas}
          max={10}
          min={1}
          novo={() => ({ paginaId: paginas.find((p) => !etapas.some((e) => e.paginaId === p.id))?.id ?? paginas[0]?.id ?? "", nome: NOMES_PADRAO[etapas.length] ?? `Etapa ${etapas.length + 1}` })}
          onMudar={setEtapas}
          render={(e, mudar) => (
            <>
              <Campo rotulo="Nome da etapa" estiloRotulo="discreto" tamanho="42" value={e.nome} maxLength={60} onChange={(x) => mudar({ ...e, nome: x.target.value })} />
              <Selecao rotulo="Página" estiloRotulo="discreto" value={e.paginaId} opcoes={opcoes} onChange={(x) => mudar({ ...e, paginaId: x.target.value })} />
            </>
          )}
        />
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </DialogoAdmin>
  );
}
