"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { Button } from "@/components/ui/button";
import { CaixaSelecao } from "@/components/ui/caixa-selecao";
import { Campo } from "@/components/ui/campo";
import { Selo } from "@/components/ui/selo";
import { acaoCriarVoucher, acaoSalvarVoucher } from "@/lib/actions/vouchers";
import type { StatusProduto } from "@/lib/db/schema/_enums";
import { dataEmBrasilia } from "@/lib/matriculas/regras";
import { useAcao } from "../_components/use-acao";
import { CAMPOS_VAZIOS, entradaDoVoucher, type CamposVoucher } from "./campos";
import { CopiarCodigo } from "./copiar-codigo";

export type ProdutoDoVoucher = {
  id: string;
  titulo: string;
  status: StatusProduto;
};

export interface FormVoucherProps {
  /** Sem `voucher` = criar. */
  voucher?: {
    id: string;
    codigo: string;
    versao: string;
    campos: CamposVoucher;
  };
  produtos: readonly ProdutoDoVoucher[];
  onFechar: () => void;
}

/** Criar/editar voucher: código (só ao criar), descrição, cursos, validade, limites e dias de acesso. */
export function FormVoucher({ voucher, produtos, onFechar }: FormVoucherProps) {
  const [c, setC] = useState<CamposVoucher>(voucher?.campos ?? CAMPOS_VAZIOS);
  const [criado, setCriado] = useState<string | null>(null);
  const { erro, setErro, pendente, rodar } = useAcao();
  const mudar =
    (campo: keyof CamposVoucher) => (e: { target: { value: string } }) =>
      setC((a) => ({ ...a, [campo]: e.target.value }));
  const alternar = (id: string, ligado: boolean) =>
    setC((a) => ({
      ...a,
      produtoIds: ligado
        ? [...a.produtoIds, id]
        : a.produtoIds.filter((x) => x !== id),
    }));

  const salvar = () => {
    const r = entradaDoVoucher(c);
    if (!r.ok) return setErro(r.erro);
    if (voucher)
      return rodar(
        () =>
          acaoSalvarVoucher({
            voucherId: voucher.id,
            versao: voucher.versao,
            ...r.entrada,
          }),
        onFechar,
      );
    rodar(
      () => acaoCriarVoucher({ codigo: c.codigo.trim() || null, ...r.entrada }),
      (d) => setCriado(d.codigo),
    );
  };

  if (criado)
    return (
      <DialogoAdmin
        aberto
        onFechar={onFechar}
        titulo="Voucher criado"
        descricao="Divulgue o código: o membro resgata na área de membros. O código não muda depois de criado."
        rodape={
          <Button size="42" onClick={onFechar}>
            Concluir
          </Button>
        }
      >
        <div className="flex justify-center rounded-lg border border-border bg-bg py-3">
          <CopiarCodigo codigo={criado} grande />
        </div>
      </DialogoAdmin>
    );

  return (
    <DialogoAdmin
      aberto
      onFechar={onFechar}
      titulo={voucher ? "Editar voucher" : "Novo voucher"}
      descricao={
        voucher
          ? `Código ${voucher.codigo} (não muda). As regras novas valem para os próximos resgates.`
          : "Um código que dá matrícula nos cursos escolhidos."
      }
      rodape={
        <>
          <Button variant="contorno" size="42" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            size="42"
            carregando={pendente}
            disabled={!c.produtoIds.length}
            onClick={salvar}
          >
            {voucher ? "Salvar" : "Criar voucher"}
          </Button>
        </>
      }
    >
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-2">
        <div className="grid gap-4 sm:grid-cols-2">
          {!voucher && (
            <Campo
              rotulo="Código (opcional)"
              value={c.codigo}
              onChange={mudar("codigo")}
              maxLength={20}
              tamanho="42"
              autoCapitalize="characters"
              className="font-mono uppercase"
              ajuda="Vazio = gerado pelo sistema. De 6 a 16 letras e números, sem 0, O, 1 e I."
            />
          )}
          <Campo
            rotulo="Descrição (opcional)"
            value={c.descricao}
            onChange={mudar("descricao")}
            maxLength={200}
            tamanho="42"
            ajuda="Só a equipe vê. Ex.: Parceria com a escola X."
          />
        </div>
        <fieldset className="m-0 flex flex-col border-0 p-0">
          <legend className="mb-1 text-[13px] font-semibold">Cursos</legend>
          {produtos.length === 0 && (
            <p className="m-0 text-[13px] text-muted">
              Nenhum curso ainda. Crie em Conteúdos.
            </p>
          )}
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
                checked={c.produtoIds.includes(p.id)}
                onChange={(e) => alternar(p.id, e.target.checked)}
              />
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="Válido até (opcional)"
            type="date"
            tamanho="42"
            min={dataEmBrasilia(new Date())}
            value={c.validoAte}
            onChange={mudar("validoAte")}
            ajuda="Vazio = sem prazo. Vale até o fim do dia."
          />
          <Campo
            rotulo="Dias de acesso (opcional)"
            type="number"
            inputMode="numeric"
            min={1}
            max={3650}
            step={1}
            tamanho="42"
            value={c.diasAcesso}
            onChange={mudar("diasAcesso")}
            ajuda="Contados do resgate. Vazio = sem expiração."
          />
          <Campo
            rotulo="Limite de usos (opcional)"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            tamanho="42"
            value={c.limiteUsos}
            onChange={mudar("limiteUsos")}
            ajuda="Vazio = sem limite."
          />
          <Campo
            rotulo="Usos por pessoa"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            step={1}
            tamanho="42"
            value={c.limitePorPessoa}
            onChange={mudar("limitePorPessoa")}
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

/** Botão "Novo voucher" do cabeçalho. */
export function NovoVoucher({
  produtos,
}: {
  produtos: readonly ProdutoDoVoucher[];
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button size="36" onClick={() => setAberto(true)}>
        <Plus className="size-3.5" aria-hidden />
        Novo voucher
      </Button>
      {aberto && (
        <FormVoucher produtos={produtos} onFechar={() => setAberto(false)} />
      )}
    </>
  );
}
