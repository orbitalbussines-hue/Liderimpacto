"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { useAcao } from "@/app/admin/membros/_components/use-acao";
import { acaoCriarAfiliado, acaoExcluirAfiliado, acaoMudarSituacaoAfiliado, acaoSalvarAfiliado } from "@/lib/actions/ofertas";
import type { SituacaoAfiliado } from "@/lib/db/schema/_enums";
import { AcoesRegistro } from "../ofertas/_components/acoes-registro";
import { centesimos, textoDeCentesimos } from "../ofertas/_components/valores";

export interface AfiliadoParaEditar {
  id: string;
  nome: string;
  email: string;
  codigo: string;
  comissaoBps: number;
  situacao: SituacaoAfiliado;
  versao: string;
}

/** Criar/editar afiliado (RN-214): o código é gerado ou escolhido ao criar e não muda depois. */
export function FormAfiliado({ afiliado, onFechar }: { afiliado?: AfiliadoParaEditar; onFechar: () => void }) {
  const [nome, setNome] = useState(afiliado?.nome ?? "");
  const [email, setEmail] = useState(afiliado?.email ?? "");
  const [codigo, setCodigo] = useState("");
  const [comissao, setComissao] = useState(afiliado ? textoDeCentesimos(afiliado.comissaoBps).replace(/,00$/, "") : "");
  const { erro, setErro, pendente, rodar } = useAcao();
  const comissaoBps = centesimos(comissao);

  const salvar = () => {
    if (comissaoBps === null) return setErro("Comissão inválida. Ex.: 30 ou 12,5.");
    const campos = { nome, email, comissaoBps };
    if (afiliado) return rodar(() => acaoSalvarAfiliado({ afiliadoId: afiliado.id, versao: afiliado.versao, ...campos }), onFechar);
    rodar(() => acaoCriarAfiliado({ codigo: codigo.trim() || null, ...campos }), onFechar);
  };

  return (
    <DialogoAdmin
      aberto
      onFechar={onFechar}
      titulo={afiliado ? "Editar afiliado" : "Novo afiliado"}
      descricao="A plataforma atribui as vendas e calcula a comissão; o pagamento ao afiliado é feito por você, fora da plataforma."
      rodape={
        <>
          <Button variant="contorno" size="42" onClick={onFechar}>
            Cancelar
          </Button>
          <Button size="42" carregando={pendente} onClick={salvar}>
            {afiliado ? "Salvar" : "Criar afiliado"}
          </Button>
        </>
      }
    >
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} tamanho="42" autoComplete="off" />
          <Campo rotulo="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} tamanho="42" autoComplete="off" />
          {!afiliado && (
            <Campo
              rotulo="Código (opcional)"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              maxLength={20}
              tamanho="42"
              autoCapitalize="characters"
              className="font-mono uppercase"
              ajuda="Vazio = gerado pelo sistema. De 4 a 20 letras e números."
            />
          )}
          <Campo
            rotulo="Comissão"
            value={comissao}
            onChange={(e) => setComissao(e.target.value)}
            inputMode="decimal"
            placeholder="30"
            tamanho="42"
            className="tabular-nums"
            sufixo={<span className="text-[13px] text-muted">%</span>}
            erro={comissao.trim() && comissaoBps === null ? "Valor inválido." : undefined}
            ajuda="De 0% a 90%, sobre o valor pago menos a taxa da plataforma. Só na primeira cobrança."
          />
        </div>
        {afiliado && (
          <p className="m-0 text-[13px] text-muted">
            Código <span className="font-mono font-bold text-text">{afiliado.codigo}</span> (não muda). A comissão nova vale para as próximas vendas.
          </p>
        )}
        {erro && (
          <p role="alert" className="m-0 text-[13px] font-semibold text-warn">
            {erro}
          </p>
        )}
      </div>
    </DialogoAdmin>
  );
}

export function NovoAfiliado() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button size="36" onClick={() => setAberto(true)}>
        <Plus className="size-3.5" aria-hidden />
        Novo afiliado
      </Button>
      {aberto && <FormAfiliado onFechar={() => setAberto(false)} />}
    </>
  );
}

export function AcoesAfiliado({ afiliado }: { afiliado: AfiliadoParaEditar }) {
  const chave = { afiliadoId: afiliado.id, versao: afiliado.versao };
  return (
    <AcoesRegistro
      descricao={`o afiliado ${afiliado.nome}`}
      ativo={afiliado.situacao === "ATIVO"}
      mudarSituacao={() => acaoMudarSituacaoAfiliado({ ...chave, situacao: afiliado.situacao === "ATIVO" ? "PAUSADO" : "ATIVO" })}
      excluir={() => acaoExcluirAfiliado(chave)}
      tituloExcluir="Excluir afiliado"
      mensagemExcluir={`${afiliado.nome} sai da lista e o código ${afiliado.codigo} deixa de atribuir vendas (a compra pelo link continua funcionando). Vendas e comissões já registradas ficam no histórico (exclusão lógica, fica na trilha).`}
      formEditar={(fechar) => <FormAfiliado afiliado={afiliado} onFechar={fechar} />}
    />
  );
}
