"use client";

import { useId, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { Button } from "@/components/ui/button";
import { CaixaSelecao } from "@/components/ui/caixa-selecao";
import { Campo } from "@/components/ui/campo";
import { ControleSegmentado } from "@/components/ui/controle-segmentado";
import { Selo } from "@/components/ui/selo";
import { useAcao } from "@/app/admin/membros/_components/use-acao";
import { acaoCriarOferta, acaoExcluirOferta, acaoMudarSituacaoOferta, acaoSalvarOferta } from "@/lib/actions/ofertas";
import type { IntervaloAssinatura, SituacaoOferta, StatusProduto, TipoOferta } from "@/lib/db/schema/_enums";
import { calcularTaxa, formatarCentavos } from "@/lib/pagamentos/regras";
import { AcoesRegistro } from "./_components/acoes-registro";
import { centesimos, formatarPercentual, textoDeCentesimos } from "./_components/valores";

export interface ProdutoDaOferta {
  id: string;
  titulo: string;
  status: StatusProduto;
}

export interface OfertaParaEditar {
  id: string;
  nome: string;
  tipo: TipoOferta;
  precoCentavos: number;
  intervalo: IntervaloAssinatura | null;
  diasAcesso: number | null;
  situacao: SituacaoOferta;
  versao: string;
  produtoIds: string[];
}

interface Comum {
  produtos: readonly ProdutoDaOferta[];
  /** Taxa da plataforma do criador (bps): estimativa do que ele recebe. */
  taxaBps: number;
}

function Grupo({ rotulo, children }: { rotulo: string; children: (idRotulo: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-[13px] font-semibold">
        {rotulo}
      </span>
      {children(id)}
    </div>
  );
}

/** Criar/editar oferta (RN-212): o tipo só se escolhe ao criar; preço e cursos valem para as próximas vendas. */
export function FormOferta({ oferta, produtos, taxaBps, onFechar }: Comum & { oferta?: OfertaParaEditar; onFechar: () => void }) {
  const [tipo, setTipo] = useState<TipoOferta>(oferta?.tipo ?? "AVULSO");
  const [nome, setNome] = useState(oferta?.nome ?? "");
  const [preco, setPreco] = useState(oferta ? textoDeCentesimos(oferta.precoCentavos) : "");
  const [intervalo, setIntervalo] = useState<IntervaloAssinatura>(oferta?.intervalo ?? "MES");
  const [prazo, setPrazo] = useState<"VITALICIO" | "DIAS">(oferta?.diasAcesso ? "DIAS" : "VITALICIO");
  const [dias, setDias] = useState(oferta?.diasAcesso?.toString() ?? "");
  const [produtoIds, setProdutoIds] = useState<string[]>(oferta?.produtoIds ?? []);
  const { erro, setErro, pendente, rodar } = useAcao();

  const precoCentavos = centesimos(preco);
  const alternar = (id: string, ligado: boolean) => setProdutoIds((a) => (ligado ? [...a, id] : a.filter((x) => x !== id)));

  const salvar = () => {
    if (precoCentavos === null) return setErro("Preço inválido. Use o formato 97,00.");
    const diasAcesso = tipo === "AVULSO" && prazo === "DIAS" ? Number(dias.trim()) : null;
    if (diasAcesso !== null && !/^\d+$/.test(dias.trim())) return setErro("Dias de acesso: use um número inteiro.");
    const campos = { nome, precoCentavos, intervalo: tipo === "ASSINATURA" ? intervalo : null, diasAcesso, produtoIds };
    if (oferta) return rodar(() => acaoSalvarOferta({ ofertaId: oferta.id, versao: oferta.versao, ...campos }), onFechar);
    rodar(() => acaoCriarOferta({ tipo, ...campos }), onFechar);
  };

  const liquido = precoCentavos !== null && precoCentavos > 0 ? precoCentavos - calcularTaxa(precoCentavos, taxaBps) : null;
  return (
    <DialogoAdmin
      aberto
      onFechar={onFechar}
      titulo={oferta ? "Editar oferta" : "Nova oferta"}
      descricao={oferta ? "Preço e cursos novos valem para as próximas vendas. O tipo não muda." : "O que você vende: um preço, um ou mais cursos e um link de compra."}
      rodape={
        <>
          <Button variant="contorno" size="42" onClick={onFechar}>
            Cancelar
          </Button>
          <Button size="42" carregando={pendente} disabled={!produtoIds.length} onClick={salvar}>
            {oferta ? "Salvar" : "Criar oferta"}
          </Button>
        </>
      }
    >
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-2">
        <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} tamanho="42" placeholder="Ex.: Liderança na prática" />
        {!oferta && (
          <Grupo rotulo="Tipo">
            {(id) => (
              <ControleSegmentado<TipoOferta>
                aria-labelledby={id}
                opcoes={[
                  { valor: "AVULSO", rotulo: "Compra única" },
                  { valor: "ASSINATURA", rotulo: "Assinatura" },
                ]}
                valor={tipo}
                onMudar={setTipo}
                className="self-start"
              />
            )}
          </Grupo>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo={tipo === "ASSINATURA" ? `Preço por ${intervalo === "ANO" ? "ano" : "mês"} (R$)` : "Preço (R$)"}
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            inputMode="decimal"
            placeholder="97,00"
            tamanho="42"
            className="tabular-nums"
            erro={preco.trim() && precoCentavos === null ? "Use o formato 97,00." : undefined}
            ajuda={liquido !== null ? `Você recebe ${formatarCentavos(liquido)} por venda (preço − ${formatarPercentual(taxaBps)} da plataforma), antes da taxa do Stripe.` : "Mínimo de R$ 1,00."}
          />
          {tipo === "ASSINATURA" ? (
            <Grupo rotulo="Cobrança">
              {(id) => (
                <ControleSegmentado<IntervaloAssinatura>
                  aria-labelledby={id}
                  opcoes={[
                    { valor: "MES", rotulo: "Mensal" },
                    { valor: "ANO", rotulo: "Anual" },
                  ]}
                  valor={intervalo}
                  onMudar={setIntervalo}
                  className="self-start"
                />
              )}
            </Grupo>
          ) : (
            <Grupo rotulo="Acesso">
              {(id) => (
                <div className="flex flex-wrap items-center gap-2">
                  <ControleSegmentado<"VITALICIO" | "DIAS">
                    aria-labelledby={id}
                    opcoes={[
                      { valor: "VITALICIO", rotulo: "Vitalício" },
                      { valor: "DIAS", rotulo: "Por dias" },
                    ]}
                    valor={prazo}
                    onMudar={setPrazo}
                  />
                  {prazo === "DIAS" && (
                    <Campo
                      rotulo="Dias de acesso"
                      rotuloOculto
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={3650}
                      step={1}
                      tamanho="42"
                      value={dias}
                      onChange={(e) => setDias(e.target.value)}
                      placeholder="365"
                      classNameMoldura="w-24"
                    />
                  )}
                </div>
              )}
            </Grupo>
          )}
        </div>
        <fieldset className="m-0 flex flex-col border-0 p-0">
          <legend className="mb-1 text-[13px] font-semibold">Cursos liberados</legend>
          {produtos.length === 0 && <p className="m-0 text-[13px] text-muted">Nenhum curso ainda. Crie em Conteúdos.</p>}
          <div className="flex max-h-44 flex-col overflow-y-auto">
            {produtos.map((p) => (
              <CaixaSelecao
                key={p.id}
                className="text-text"
                rotulo={
                  <>
                    {p.titulo}
                    {p.status === "RASCUNHO" && (
                      <Selo tom="transparente" forma="etiqueta">
                        Rascunho
                      </Selo>
                    )}
                  </>
                }
                checked={produtoIds.includes(p.id)}
                onChange={(e) => alternar(p.id, e.target.checked)}
              />
            ))}
          </div>
        </fieldset>
        {erro && (
          <p role="alert" className="m-0 text-[13px] font-semibold text-warn">
            {erro}
          </p>
        )}
      </div>
    </DialogoAdmin>
  );
}

/** Botão "Nova oferta" do cabeçalho. */
export function NovaOferta(props: Comum) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button size="36" onClick={() => setAberto(true)}>
        <Plus className="size-3.5" aria-hidden />
        Nova oferta
      </Button>
      {aberto && <FormOferta {...props} onFechar={() => setAberto(false)} />}
    </>
  );
}

/** Menu da linha: editar, pausar/ativar e excluir (some da venda; o histórico fica). */
export function AcoesOferta({ oferta, ...comum }: Comum & { oferta: OfertaParaEditar }) {
  const chave = { ofertaId: oferta.id, versao: oferta.versao };
  return (
    <AcoesRegistro
      descricao={`a oferta ${oferta.nome}`}
      ativo={oferta.situacao === "ATIVA"}
      mudarSituacao={() => acaoMudarSituacaoOferta({ ...chave, situacao: oferta.situacao === "ATIVA" ? "PAUSADA" : "ATIVA" })}
      excluir={() => acaoExcluirOferta(chave)}
      tituloExcluir="Excluir oferta"
      mensagemExcluir={`${oferta.nome} sai da lista e o link de compra para de vender. Vendas, assinaturas e matrículas já feitas continuam (exclusão lógica, fica na trilha). Para suspender por um tempo, use Pausar.`}
      formEditar={(fechar) => <FormOferta oferta={oferta} {...comum} onFechar={fechar} />}
    />
  );
}
