"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { ControleSegmentado } from "@/components/ui/controle-segmentado";
import { Selecao } from "@/components/ui/selecao";
import { useAcao } from "@/app/admin/membros/_components/use-acao";
import { acaoCriarCupom, acaoExcluirCupom, acaoMudarSituacaoCupom, acaoSalvarCupom } from "@/lib/actions/ofertas";
import type { SituacaoCupom, TipoCupom } from "@/lib/db/schema/_enums";
import { dataEmBrasilia, fimDoDiaEmBrasilia } from "@/lib/matriculas/regras";
import { AcoesRegistro } from "../ofertas/_components/acoes-registro";
import { centesimos, textoDeCentesimos } from "../ofertas/_components/valores";

export interface CupomParaEditar {
  id: string;
  codigo: string;
  tipo: TipoCupom;
  percentualBps: number | null;
  valorCentavos: number | null;
  ofertaId: string | null;
  validoAte: string | null;
  limiteUsos: number | null;
  situacao: SituacaoCupom;
  usos: number;
  versao: string;
}

interface Comum {
  ofertas: readonly { id: string; nome: string }[];
}

/** Criar/editar cupom (RN-213): o código só se escolhe ao criar. */
export function FormCupom({ cupom, ofertas, onFechar }: Comum & { cupom?: CupomParaEditar; onFechar: () => void }) {
  const [codigo, setCodigo] = useState("");
  const [tipo, setTipo] = useState<TipoCupom>(cupom?.tipo ?? "PERCENTUAL");
  const inicial = cupom?.tipo === "VALOR" ? cupom.valorCentavos : cupom?.percentualBps;
  // 1000 bps → "10" (percentual sem ",00"); 2000 centavos → "20,00".
  const [desconto, setDesconto] = useState(!inicial ? "" : cupom?.tipo === "PERCENTUAL" ? textoDeCentesimos(inicial).replace(/,00$/, "") : textoDeCentesimos(inicial));
  const [ofertaId, setOfertaId] = useState(cupom?.ofertaId ?? "");
  const [validoAte, setValidoAte] = useState(cupom?.validoAte ? dataEmBrasilia(new Date(cupom.validoAte)) : "");
  const [limite, setLimite] = useState(cupom?.limiteUsos?.toString() ?? "");
  const { erro, setErro, pendente, rodar } = useAcao();
  const valor = centesimos(desconto);
  const idTipo = useId();

  const salvar = () => {
    if (valor === null) return setErro(tipo === "PERCENTUAL" ? "Desconto inválido. Ex.: 10 ou 12,5." : "Desconto inválido. Ex.: 20,00.");
    if (limite.trim() && !/^\d+$/.test(limite.trim())) return setErro("Limite de usos: use um número inteiro.");
    const fim = validoAte ? fimDoDiaEmBrasilia(validoAte) : null;
    if (validoAte && !fim) return setErro("Data de validade inválida.");
    const campos = {
      tipo,
      percentualBps: tipo === "PERCENTUAL" ? valor : null,
      valorCentavos: tipo === "VALOR" ? valor : null,
      ofertaId: ofertaId || null,
      validoAte: fim?.toISOString() ?? null,
      limiteUsos: limite.trim() ? Number(limite.trim()) : null,
    };
    if (cupom) return rodar(() => acaoSalvarCupom({ cupomId: cupom.id, versao: cupom.versao, ...campos }), onFechar);
    rodar(() => acaoCriarCupom({ codigo, ...campos }), onFechar);
  };

  return (
    <DialogoAdmin
      aberto
      onFechar={onFechar}
      titulo={cupom ? "Editar cupom" : "Novo cupom"}
      descricao={cupom ? `Código ${cupom.codigo} (não muda). As regras novas valem para as próximas compras.` : "Desconto aplicado no link de compra. Em assinatura, vale em todas as cobranças."}
      rodape={
        <>
          <Button variant="contorno" size="42" onClick={onFechar}>
            Cancelar
          </Button>
          <Button size="42" carregando={pendente} disabled={!cupom && !codigo.trim()} onClick={salvar}>
            {cupom ? "Salvar" : "Criar cupom"}
          </Button>
        </>
      }
    >
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-2">
        {!cupom && (
          <Campo
            rotulo="Código"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            maxLength={20}
            tamanho="42"
            autoCapitalize="characters"
            className="font-mono uppercase"
            placeholder="BEMVINDO10"
            ajuda="De 3 a 20 letras e números. O comprador pode digitar em minúscula."
          />
        )}
        <div className="flex flex-col gap-1.5">
          <span id={idTipo} className="text-[13px] font-semibold">
            Desconto
          </span>
          <div className="flex flex-wrap items-start gap-2">
            <ControleSegmentado<TipoCupom>
              aria-labelledby={idTipo}
              opcoes={[
                { valor: "PERCENTUAL", rotulo: "Percentual (%)" },
                { valor: "VALOR", rotulo: "Valor (R$)" },
              ]}
              valor={tipo}
              onMudar={setTipo}
            />
            <Campo
              rotulo={tipo === "PERCENTUAL" ? "Percentual de desconto" : "Valor do desconto em reais"}
              rotuloOculto
              value={desconto}
              onChange={(e) => setDesconto(e.target.value)}
              inputMode="decimal"
              placeholder={tipo === "PERCENTUAL" ? "10" : "20,00"}
              tamanho="42"
              className="tabular-nums"
              sufixo={<span className="text-[13px] text-muted">{tipo === "PERCENTUAL" ? "%" : "R$"}</span>}
              classNameMoldura="w-32"
              erro={desconto.trim() && valor === null ? "Valor inválido." : undefined}
            />
          </div>
        </div>
        <Selecao
          rotulo="Vale para"
          vazio="Todas as ofertas"
          opcoes={ofertas.map((o) => ({ valor: o.id, rotulo: o.nome }))}
          value={ofertaId}
          onChange={(e) => setOfertaId(e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="Válido até (opcional)"
            type="date"
            tamanho="42"
            min={dataEmBrasilia(new Date())}
            value={validoAte}
            onChange={(e) => setValidoAte(e.target.value)}
            ajuda="Vazio = sem prazo. Vale até o fim do dia."
          />
          <Campo
            rotulo="Limite de usos (opcional)"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            tamanho="42"
            value={limite}
            onChange={(e) => setLimite(e.target.value)}
            ajuda="Vazio = sem limite. Conta venda paga ou com Pix/boleto emitido."
          />
        </div>
        {erro && (
          <p role="alert" className="m-0 text-[13px] font-semibold text-warn">
            {erro}
          </p>
        )}
      </div>
    </DialogoAdmin>
  );
}

export function NovoCupom(props: Comum) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button size="36" onClick={() => setAberto(true)}>
        <Plus className="size-3.5" aria-hidden />
        Novo cupom
      </Button>
      {aberto && <FormCupom {...props} onFechar={() => setAberto(false)} />}
    </>
  );
}

export function AcoesCupom({ cupom, ...comum }: Comum & { cupom: CupomParaEditar }) {
  const chave = { cupomId: cupom.id, versao: cupom.versao };
  return (
    <AcoesRegistro
      descricao={`o cupom ${cupom.codigo}`}
      ativo={cupom.situacao === "ATIVO"}
      mudarSituacao={() => acaoMudarSituacaoCupom({ ...chave, situacao: cupom.situacao === "ATIVO" ? "PAUSADO" : "ATIVO" })}
      excluir={() => acaoExcluirCupom(chave)}
      tituloExcluir="Excluir cupom"
      mensagemExcluir={`${cupom.codigo} deixa de valer nos links de compra e sai da lista. Vendas já feitas com ele continuam (exclusão lógica, fica na trilha). Para suspender por um tempo, use Pausar.`}
      formEditar={(fechar) => <FormCupom cupom={cupom} {...comum} onFechar={fechar} />}
    />
  );
}
