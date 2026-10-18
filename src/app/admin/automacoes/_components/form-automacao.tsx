"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { Aviso } from "@/components/ui/aviso";
import { Button, buttonVariants } from "@/components/ui/button";
import { CaixaSelecao } from "@/components/ui/caixa-selecao";
import { Campo } from "@/components/ui/campo";
import { Cartao } from "@/components/ui/cartao";
import { Selecao } from "@/components/ui/selecao";
import { Selo } from "@/components/ui/selo";
import { acaoCriarAutomacao, acaoMudarSituacaoAutomacao, acaoSalvarAutomacao } from "@/lib/actions/automacoes";
import type { GatilhoAutomacao, SituacaoAutomacao } from "@/lib/db/schema/_enums";
import type { ConteudoMarketing } from "@/lib/db/schema/marketing";
import { CamposEmail } from "./campos-email";
import { CAMPOS_VAZIOS, entradaDaAutomacao, type CamposAutomacao, type ErrosAutomacao } from "./campos";
import { descreverAtraso, descreverGatilho, MINUTOS_POR, OPCOES_GATILHO, pedeCurso, pedeDias, type UnidadeAtraso } from "./comum";

export interface FormAutomacaoProps {
  /** Sem `automacao` = criar. */
  automacao?: { id: string; versao: string; situacao: SituacaoAutomacao; campos: CamposAutomacao };
  produtos: readonly { id: string; titulo: string }[];
  tags: readonly { id: string; nome: string }[];
  modelos: readonly { id: string; nome: string; conteudo: ConteudoMarketing }[];
}

const LISTA = "/admin/automacoes";
const UNIDADES: { valor: UnidadeAtraso; rotulo: string }[] = [
  { valor: "minutos", rotulo: "minutos" },
  { valor: "horas", rotulo: "horas" },
  { valor: "dias", rotulo: "dias" },
];

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: ReactNode }) {
  return (
    <Cartao como="section" aria-label={titulo} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 font-sans text-base font-semibold tracking-normal">{titulo}</h2>
        {descricao && <p className="m-0 text-[13px] text-muted">{descricao}</p>}
      </div>
      {children}
    </Cartao>
  );
}

/** Criar/editar automação (RN-224): quando, espera, o que fazer. Nasce PAUSADA; ao salvar, oferece "Ativar". */
export function FormAutomacao({ automacao, produtos, tags, modelos }: FormAutomacaoProps) {
  const router = useRouter();
  const [c, setC] = useState<CamposAutomacao>(automacao?.campos ?? CAMPOS_VAZIOS);
  const [erros, setErros] = useState<ErrosAutomacao>({});
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  // Depois de salvar uma automação pausada: id + versão nova para o "Ativar agora".
  const [salva, setSalva] = useState<{ id: string; versao: string; nova: boolean } | null>(null);
  const [pendente, iniciar] = useTransition();
  const mudar = (parcial: Partial<CamposAutomacao>) => setC((a) => ({ ...a, ...parcial }));
  const ativa = automacao?.situacao === "ATIVA";

  const salvar = () => {
    const r = entradaDaAutomacao(c);
    if (!r.ok) return setErros(r.erros);
    setErros({});
    setErroServidor(null);
    iniciar(async () => {
      const resp = await (automacao
        ? acaoSalvarAutomacao({ automacaoId: automacao.id, versao: automacao.versao, ...r.entrada }).then((x) => (x.ok ? { ok: true as const, id: automacao.id, versao: x.dados.versao } : x))
        : acaoCriarAutomacao(r.entrada).then((x) => (x.ok ? { ok: true as const, ...x.dados } : x))
      ).catch(() => null);
      if (!resp) return setErroServidor("Sem conexão com o servidor. Tente de novo.");
      if (!resp.ok) return setErroServidor(resp.erro);
      if (ativa) {
        router.push(LISTA);
        return router.refresh();
      }
      setSalva({ id: resp.id, versao: resp.versao, nova: !automacao });
    });
  };

  const ativar = () =>
    salva &&
    iniciar(async () => {
      const r = await acaoMudarSituacaoAutomacao({ automacaoId: salva.id, versao: salva.versao, situacao: "ATIVA" }).catch(() => null);
      if (!r || !r.ok) {
        setSalva(null);
        return setErroServidor(r ? r.erro : "Sem conexão com o servidor. Tente de novo.");
      }
      router.push(LISTA);
      router.refresh();
    });

  const atrasoMin = Number(c.atrasoValor) * MINUTOS_POR[c.atrasoUnidade];
  const resumo = `${descreverGatilho(c.gatilho, produtos.find((p) => p.id === c.produtoId)?.titulo ?? null, Number(c.dias) || null)}, ${
    Number.isInteger(atrasoMin) && atrasoMin > 0 ? descreverAtraso(atrasoMin).toLowerCase() : "na hora"
  }.`;

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        salvar();
      }}
    >
      <Secao titulo="Nome e situação">
        <Campo rotulo="Nome" value={c.nome} onChange={(e) => mudar({ nome: e.target.value })} maxLength={80} tamanho="42" placeholder="Ex.: Parabéns pela conclusão" erro={erros.nome} ajuda="Só a equipe vê." />
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          <Selo tom={ativa ? "ok" : "neutro"}>{ativa ? "Ativa" : "Pausada"}</Selo>
          {ativa
            ? "As mudanças valem para o que acontecer depois de salvar."
            : automacao
              ? "Pausada: nada acontece até você ativar."
              : "Toda automação nasce pausada: nada acontece até você ativar. Ao salvar, você pode ativar na hora."}
        </div>
      </Secao>

      <Secao titulo="Quando" descricao={automacao ? "O gatilho não muda depois de criada. Para outro gatilho, crie uma nova automação." : "O que precisa acontecer para a automação agir. Vale só para alunos."}>
        <Selecao
          rotulo="Gatilho"
          opcoes={OPCOES_GATILHO}
          value={c.gatilho}
          disabled={!!automacao}
          onChange={(e) => mudar({ gatilho: e.target.value as GatilhoAutomacao, produtoId: "", dias: "" })}
        />
        {pedeCurso(c.gatilho) && (
          <Selecao
            rotulo="Curso"
            vazio="Qualquer curso"
            opcoes={produtos.map((p) => ({ valor: p.id, rotulo: p.titulo }))}
            value={c.produtoId}
            onChange={(e) => mudar({ produtoId: e.target.value })}
            erro={erros.produtoId}
          />
        )}
        {pedeDias(c.gatilho) && (
          <Campo
            rotulo={c.gatilho === "INATIVIDADE" ? "Dias sem entrar" : "Dias depois do cadastro"}
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            step={1}
            tamanho="42"
            classNameMoldura="max-w-[220px]"
            value={c.dias}
            onChange={(e) => mudar({ dias: e.target.value })}
            erro={erros.dias}
            ajuda="Verificado uma vez por dia, às 9h."
          />
        )}
      </Secao>

      <Secao titulo="Espera" descricao="Quanto tempo depois do gatilho a ação acontece. 0 = na hora. Até 30 dias.">
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="mb-1 p-0 text-[13px] font-semibold">Esperar</legend>
          <div className="flex flex-wrap items-start gap-2">
            <Campo
              rotulo="Quantidade"
              rotuloOculto
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              tamanho="42"
              classNameMoldura="w-28"
              value={c.atrasoValor}
              onChange={(e) => mudar({ atrasoValor: e.target.value })}
              erro={erros.atraso}
            />
            <Selecao rotulo="Unidade" rotuloOculto opcoes={UNIDADES} value={c.atrasoUnidade} onChange={(e) => mudar({ atrasoUnidade: e.target.value as UnidadeAtraso })} classNameMoldura="w-32" />
          </div>
        </fieldset>
        <p className="m-0 text-[13px] text-text">{resumo}</p>
      </Secao>

      <Secao titulo="O que fazer" descricao="Escolha uma ação ou as duas.">
        <div className="flex flex-col">
          <CaixaSelecao rotulo="Enviar um e-mail" className="text-text" checked={c.comEmail} onChange={(e) => mudar({ comEmail: e.target.checked })} />
          {c.comEmail && <CamposEmail campos={c} erros={erros} modelos={modelos} onMudar={mudar} />}
          <CaixaSelecao rotulo="Aplicar uma tag" className="text-text" checked={c.comTag} onChange={(e) => mudar({ comTag: e.target.checked })} />
          {c.comTag &&
            (tags.length ? (
              <Selecao rotulo="Tag" rotuloOculto vazio="Escolha a tag" opcoes={tags.map((t) => ({ valor: t.id, rotulo: t.nome }))} value={c.tagId} onChange={(e) => mudar({ tagId: e.target.value })} erro={erros.tagId} classNameMoldura="max-w-sm pl-6" />
            ) : (
              <p className="m-0 pl-6 text-[13px] text-muted">
                Nenhuma tag ainda. Crie em{" "}
                <Link href="/admin/membros/tags" className="text-text underline">
                  Membros › Tags
                </Link>
                .
              </p>
            ))}
          {erros.acao && <p className="m-0 mt-1 text-xs text-warn">{erros.acao}</p>}
        </div>
      </Secao>

      {erroServidor && <Aviso tom="erro">{erroServidor}</Aviso>}
      {Object.keys(erros).length > 0 && <Aviso tom="erro">Confira os campos marcados.</Aviso>}

      <div className="flex flex-wrap justify-end gap-2">
        <Link href={LISTA} className={buttonVariants({ variant: "contorno", size: "42" })}>
          Cancelar
        </Link>
        <Button type="submit" size="42" carregando={pendente && !salva}>
          {automacao ? "Salvar" : "Criar automação"}
        </Button>
      </div>

      <DialogoAdmin
        aberto={salva !== null}
        onFechar={() => router.push(LISTA)}
        titulo={salva?.nova ? "Automação criada" : "Alterações salvas"}
        descricao="Ela está pausada: nada acontece até você ativar. Ativando agora, ela passa a agir no que acontecer daqui em diante; o que já aconteceu não conta."
        rodape={
          <>
            <Button variant="contorno" size="42" onClick={() => router.push(LISTA)} disabled={pendente}>
              Deixar pausada
            </Button>
            <Button size="42" onClick={ativar} carregando={pendente}>
              Ativar agora
            </Button>
          </>
        }
      >
        <p className="m-0 text-[13px] text-text">{resumo}</p>
      </DialogoAdmin>
    </form>
  );
}
