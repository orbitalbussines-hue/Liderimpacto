"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, RotateCw, Trash2 } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { CaixaSelecao } from "@/components/ui/caixa-selecao";
import { Campo } from "@/components/ui/campo";
import { Selecao } from "@/components/ui/selecao";
import type { Resultado } from "@/lib/acao";
import { acaoCriarMapeamento, acaoExcluirMapeamento, acaoReprocessarEventoIntegracao } from "@/lib/actions/integracoes";
import type { PlataformaIntegracao } from "@/lib/db/schema/_enums";
import { ROTULO_PLATAFORMA } from "@/lib/integracoes/regras";
import { criarMapeamentoSchema } from "@/lib/validators/integracoes";

const SEM_CONEXAO = "Sem conexão com o servidor. Tente de novo.";
const ID_FORM = "form-mapeamento";

type Erros = Partial<Record<"produtoExterno" | "nomeExterno" | "produtoIds" | "diasAcesso" | "integracaoId", string>>;

const AJUDA_ID: Record<PlataformaIntegracao, string> = {
  HOTMART: "Na Hotmart: Produtos › o produto › o número em \"ID do produto\".",
  EDUZZ: "Na Eduzz: Produtos › o produto › o código do produto (aparece também no evento recebido abaixo).",
};

export interface ConexaoParaMapear {
  id: string;
  plataforma: PlataformaIntegracao;
}

/** "Novo mapeamento": produto externo (id + nome opcional) → 1+ cursos, com dias de acesso ou vitalício. */
export function BotaoNovoMapeamento({ conexoes, cursos }: { conexoes: ConexaoParaMapear[]; cursos: { id: string; titulo: string }[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button size="36" onClick={() => setAberto(true)} disabled={conexoes.length === 0} title={conexoes.length === 0 ? "Conecte a Hotmart ou a Eduzz primeiro." : undefined}>
        <Plus className="size-3.5" aria-hidden />
        Novo mapeamento
      </Button>
      {aberto && <Formulario conexoes={conexoes} cursos={cursos} onFechar={() => setAberto(false)} />}
    </>
  );
}

function Formulario({ conexoes, cursos, onFechar }: { conexoes: ConexaoParaMapear[]; cursos: { id: string; titulo: string }[]; onFechar: () => void }) {
  const router = useRouter();
  const [integracaoId, setIntegracaoId] = useState(conexoes[0]?.id ?? "");
  const [produtoExterno, setProdutoExterno] = useState("");
  const [nomeExterno, setNomeExterno] = useState("");
  const [produtoIds, setProdutoIds] = useState<string[]>([]);
  const [dias, setDias] = useState("");
  const [erros, setErros] = useState<Erros>({});
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const plataforma = conexoes.find((c) => c.id === integracaoId)?.plataforma ?? "HOTMART";

  const salvar = () => {
    const v = criarMapeamentoSchema.safeParse({ integracaoId, produtoExterno, nomeExterno, produtoIds, diasAcesso: dias.trim() === "" ? null : Number(dias) });
    if (!v.success) {
      const novos: Erros = {};
      for (const i of v.error.issues) novos[i.path[0] as keyof Erros] ??= i.path[0] === "diasAcesso" ? "Dias de 1 a 3650, ou vazio para vitalício." : i.message;
      return setErros(novos);
    }
    setErros({});
    iniciar(async () => {
      const r = await acaoCriarMapeamento(v.data).catch(() => null);
      if (!r) return setErroServidor(SEM_CONEXAO);
      if (!r.ok) return setErroServidor(r.erro);
      onFechar();
      router.refresh();
    });
  };

  return (
    <DialogoAdmin
      aberto
      onFechar={onFechar}
      titulo="Novo mapeamento"
      descricao="Quando chegar uma compra aprovada deste produto, a pessoa é matriculada nos cursos escolhidos."
      rodape={
        <>
          <Button variant="contorno" size="42" onClick={onFechar} disabled={pendente}>
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} size="42" carregando={pendente}>
            {pendente ? "Salvando..." : "Salvar mapeamento"}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        {conexoes.length > 1 && (
          <Selecao rotulo="Plataforma" value={integracaoId} onChange={(e) => setIntegracaoId(e.target.value)} opcoes={conexoes.map((c) => ({ valor: c.id, rotulo: ROTULO_PLATAFORMA[c.plataforma] }))} erro={erros.integracaoId} />
        )}
        <Campo rotulo="Id do produto" value={produtoExterno} onChange={(e) => setProdutoExterno(e.target.value)} maxLength={64} tamanho="42" ajuda={erros.produtoExterno ? undefined : AJUDA_ID[plataforma]} erro={erros.produtoExterno} className="font-mono text-[13px]" />
        <Campo rotulo="Nome do produto (opcional)" value={nomeExterno} onChange={(e) => setNomeExterno(e.target.value)} maxLength={120} tamanho="42" placeholder="Para você reconhecer na lista" erro={erros.nomeExterno} />
        <fieldset className="m-0 flex flex-col border-0 p-0" aria-describedby={erros.produtoIds ? "erro-cursos" : undefined}>
          <legend className="mb-1 p-0 text-[13px] font-semibold">Cursos liberados</legend>
          {cursos.length === 0 ? (
            <p className="m-0 text-[13px] text-muted">Nenhum curso nesta área ainda.</p>
          ) : (
            <div className="flex max-h-56 flex-col overflow-y-auto rounded-md border border-border px-3 py-1">
              {cursos.map((c) => (
                <CaixaSelecao
                  key={c.id}
                  rotulo={c.titulo}
                  checked={produtoIds.includes(c.id)}
                  onChange={(e) => setProdutoIds((atual) => (e.target.checked ? [...atual, c.id] : atual.filter((x) => x !== c.id)))}
                  className="shrink-0 text-text"
                />
              ))}
            </div>
          )}
          {erros.produtoIds && (
            <p id="erro-cursos" className="m-0 mt-1 text-xs text-warn">
              {erros.produtoIds}
            </p>
          )}
        </fieldset>
        <Campo
          rotulo="Dias de acesso"
          type="number"
          inputMode="numeric"
          min={1}
          max={3650}
          value={dias}
          onChange={(e) => setDias(e.target.value)}
          tamanho="42"
          placeholder="Vitalício"
          ajuda={erros.diasAcesso ? undefined : "Vazio = vitalício. Assinatura da Hotmart vai até a próxima cobrança + 3 dias, sem precisar disto."}
          erro={erros.diasAcesso}
        />
        {erroServidor && <Aviso tom="erro">{erroServidor}</Aviso>}
      </form>
    </DialogoAdmin>
  );
}

function useAcao() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = <T,>(acao: () => Promise<Resultado<T>>) =>
    iniciar(async () => {
      const r = await acao().catch(() => null);
      if (!r) return setErro(SEM_CONEXAO);
      if (!r.ok) return setErro(r.erro);
      setErro(null);
      router.refresh();
    });
  const avisoErro = (
    <DialogoAdmin
      aberto={erro !== null}
      onFechar={() => setErro(null)}
      titulo="Não foi possível concluir"
      rodape={
        <Button size="42" onClick={() => setErro(null)}>
          Entendi
        </Button>
      }
    >
      <Aviso tom="erro">{erro}</Aviso>
    </DialogoAdmin>
  );
  return { pendente, rodar, avisoErro };
}

/** Tira um curso do mapeamento (ModalConfirmacaoBlock). Matrículas já feitas continuam. */
export function ExcluirMapeamento({ id, versao, descricao }: { id: string; versao: string; descricao: string }) {
  const [aberto, setAberto] = useState(false);
  const { pendente, rodar, avisoErro } = useAcao();
  return (
    <>
      <Button variant="fantasma" size="icone36" aria-label={`Remover o mapeamento ${descricao}`} className="text-muted" onClick={() => setAberto(true)}>
        <Trash2 aria-hidden />
      </Button>
      <ModalConfirmacaoBlock
        aberto={aberto}
        titulo="Remover mapeamento"
        mensagem={`Remove ${descricao}. As próximas compras deste produto deixam de liberar este curso; quem já foi matriculado continua com o acesso.`}
        textoConfirmar="Remover"
        carregando={pendente}
        onCancelar={() => setAberto(false)}
        onConfirmar={() => {
          setAberto(false);
          rodar(() => acaoExcluirMapeamento({ mapeamentoId: id, versao }));
        }}
      />
      {avisoErro}
    </>
  );
}

/** Volta o evento (sem mapeamento ou com erro) para a fila. */
export function Reprocessar({ eventoId, versao }: { eventoId: string; versao: string }) {
  const { pendente, rodar, avisoErro } = useAcao();
  return (
    <>
      <Button variant="contorno" size="36" carregando={pendente} onClick={() => rodar(() => acaoReprocessarEventoIntegracao({ eventoId, versao }))}>
        <RotateCw className="size-3.5" aria-hidden />
        Reprocessar
      </Button>
      {avisoErro}
    </>
  );
}
