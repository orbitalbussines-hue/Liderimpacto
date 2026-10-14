"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CaixaSelecao } from "@/components/ui/caixa-selecao";
import { Campo } from "@/components/ui/campo";
import { CampoBusca } from "@/components/ui/campo-busca";
import { Estatistica } from "@/components/ui/estatistica";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { Selecao } from "@/components/ui/selecao";
import { Selo } from "@/components/ui/selo";
import { acaoBuscarMembros, acaoMatricular, type ResultadoMatricular } from "@/lib/actions/matriculas";
import type { StatusProduto } from "@/lib/db/schema/_enums";
import { dataEmBrasilia, fimDoDiaEmBrasilia } from "@/lib/matriculas/regras";

interface Pessoa {
  id: string;
  nome: string;
  email: string;
  imagem?: string | null;
}

export interface DialogoMatricularProps {
  aberto: boolean;
  onFechar: () => void;
  produtos: readonly { id: string; titulo: string; status: StatusProduto }[];
  grupos: readonly { id: string; nome: string }[];
  /** Pré-escolhido (menu "Matricular em…" da linha em Membros). */
  membroInicial?: Pessoa;
}

type Modo = "pessoas" | "grupo";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Matricular pessoas (busca) OU um grupo inteiro em um ou mais produtos, com expiração opcional.
 * Resumo no modal block antes de gravar; depois, quantas foram criadas/reativadas/já existiam.
 * Pessoa que ainda não é membro: o caminho é o cadastro (link), nunca um cadastro paralelo aqui.
 */
export function DialogoMatricular({ aberto, onFechar, produtos, grupos, membroInicial }: DialogoMatricularProps) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("pessoas");
  const [pessoas, setPessoas] = useState<Pessoa[]>(membroInicial ? [membroInicial] : []);
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Pessoa[] | null>(null);
  const [grupoId, setGrupoId] = useState("");
  const [produtoIds, setProdutoIds] = useState<string[]>([]);
  const [expira, setExpira] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoMatricular | null>(null);
  const [pendente, iniciar] = useTransition();

  // Busca com pausa de 300 ms a partir de 2 letras (a action filtra o criador do host).
  useEffect(() => {
    if (busca.trim().length < 2) return;
    const t = setTimeout(async () => {
      const r = await acaoBuscarMembros({ busca });
      setAchados(r.ok ? r.dados : []);
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  const grupo = grupos.find((g) => g.id === grupoId);
  const escolhidos = produtos.filter((p) => produtoIds.includes(p.id));
  const quem = modo === "grupo" ? (grupo ? `todos os membros do grupo "${grupo.nome}"` : "") : plural(pessoas.length, "pessoa", "pessoas");
  const prontoParaConfirmar = (modo === "grupo" ? !!grupo : pessoas.length > 0) && escolhidos.length > 0;
  const dataFim = expira ? fimDoDiaEmBrasilia(expira) : null;

  const fechar = () => {
    setResultado(null);
    setErro(null);
    onFechar();
  };

  const confirmar = () =>
    iniciar(async () => {
      const r = await acaoMatricular({
        membroIds: modo === "pessoas" ? pessoas.map((p) => p.id) : [],
        grupoId: modo === "grupo" ? grupoId : null,
        produtoIds,
        expiraEm: expira || null,
      });
      setConfirmando(false);
      if (!r.ok) return setErro(r.erro);
      setErro(null);
      setResultado(r.dados);
      router.refresh();
    });

  const corpo = resultado ? (
    <div role="status" className="grid grid-cols-3 gap-3">
      <Estatistica valor={resultado.criadas} rotulo="criadas" tom="accent" />
      <Estatistica valor={resultado.reativadas} rotulo="reativadas" />
      <Estatistica valor={resultado.jaExistiam} rotulo="já existiam" />
    </div>
  ) : (
    <div className="flex flex-col gap-4">
      <GrupoChips
        aria-label="Quem matricular"
        opcoes={[
          { valor: "pessoas", rotulo: "Pessoas" },
          { valor: "grupo", rotulo: "Grupo inteiro" },
        ]}
        valor={modo}
        onMudar={setModo}
      />
      {modo === "pessoas" ? (
        <div className="flex flex-col gap-2">
          <CampoBusca rotulo="Buscar membro" placeholder="Nome ou e-mail do membro..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          {busca.trim().length >= 2 && achados && (
            <ul className="m-0 flex max-h-40 list-none flex-col overflow-y-auto rounded-lg border border-border bg-bg p-1 text-[13px]">
              {achados.length === 0 && (
                <li className="p-2 text-muted">
                  Ninguém com esse nome ou e-mail nesta área.{" "}
                  <Link href="/admin/membros/cadastrar" className="font-semibold text-accent underline">
                    Cadastrar o membro
                  </Link>
                </li>
              )}
              {achados.map((a) => {
                const ja = pessoas.some((p) => p.id === a.id);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      disabled={ja}
                      onClick={() => setPessoas((ps) => [...ps, a])}
                      className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-surface-2 disabled:opacity-50"
                    >
                      <Avatar nome={a.nome} src={a.imagem} tamanho={28} />
                      <span className="min-w-0 flex-1 truncate">
                        <b>{a.nome}</b> · <span className="text-muted">{a.email}</span>
                      </span>
                      {ja && <span className="text-xs text-muted">escolhido</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {pessoas.length > 0 && (
            <ul aria-label="Pessoas escolhidas" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {pessoas.map((p) => (
                <li key={p.id}>
                  <Selo tom="neutro" forma="rotulo" className="gap-1">
                    {p.nome}
                    <button type="button" aria-label={`Tirar ${p.nome}`} onClick={() => setPessoas((ps) => ps.filter((x) => x.id !== p.id))} className="inline-grid">
                      <X className="size-3" aria-hidden />
                    </button>
                  </Selo>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <Selecao
          rotulo="Grupo"
          vazio={grupos.length ? "Escolha um grupo" : "Esta área ainda não tem grupos"}
          opcoes={grupos.map((g) => ({ valor: g.id, rotulo: g.nome }))}
          value={grupoId}
          onChange={(e) => setGrupoId(e.target.value)}
        />
      )}
      <fieldset className="m-0 flex flex-col border-0 p-0">
        <legend className="mb-1 text-[13px] font-semibold">Produtos</legend>
        {produtos.length === 0 && <p className="m-0 text-[13px] text-muted">Nenhum produto ainda. Crie em Conteúdos.</p>}
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
              onChange={(e) => setProdutoIds((ids) => (e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id)))}
            />
          ))}
        </div>
      </fieldset>
      <Campo
        rotulo="Expira em (opcional)"
        type="date"
        tamanho="42"
        min={dataEmBrasilia(new Date())}
        value={expira}
        onChange={(e) => setExpira(e.target.value)}
        ajuda="Vazio = sem expiração. Vale até o fim do dia (horário de Brasília)."
      />
      {erro && (
        <p role="alert" className="m-0 text-[13px] font-semibold text-warn">
          {erro}
        </p>
      )}
    </div>
  );

  return (
    <>
      <DialogoAdmin
        aberto={aberto && !confirmando}
        onFechar={fechar}
        titulo={resultado ? "Matrículas gravadas" : "Matricular"}
        descricao={
          resultado
            ? `${plural(resultado.pessoas, "pessoa", "pessoas")} × ${plural(resultado.produtos, "produto", "produtos")}. Quem já tinha matrícula ativa ficou como estava.`
            : "Escolha pessoas ou um grupo e os produtos. Quem já tem matrícula ativa fica como está; cancelada ou expirada é reativada."
        }
        rodape={
          resultado ? (
            <Button size="42" onClick={fechar}>
              Concluir
            </Button>
          ) : (
            <>
              <Button variant="contorno" size="42" onClick={fechar}>
                Cancelar
              </Button>
              <Button size="42" disabled={!prontoParaConfirmar} onClick={() => setConfirmando(true)}>
                Continuar
              </Button>
            </>
          )
        }
      >
        {corpo}
      </DialogoAdmin>
      <ModalConfirmacaoBlock
        aberto={aberto && confirmando}
        titulo="Confirmar matrículas"
        mensagem={`Matricular ${quem} em: ${escolhidos.map((p) => p.titulo).join(", ")}. ${
          dataFim ? `Acesso até ${dataFim.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.` : "Sem expiração."
        }${escolhidos.some((p) => p.status === "RASCUNHO") ? " Produto em rascunho: o aluno só assiste depois de publicado." : ""} Tudo numa operação só (se algo falhar, nada é gravado).`}
        textoConfirmar="Matricular"
        carregando={pendente}
        onCancelar={() => setConfirmando(false)}
        onConfirmar={confirmar}
      />
    </>
  );
}
