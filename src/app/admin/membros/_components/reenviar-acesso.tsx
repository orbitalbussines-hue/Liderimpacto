"use client";

import { useEffect, useState, useTransition } from "react";
import { MailCheck } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { CaixaSelecao } from "@/components/ui/caixa-selecao";
import { Selecao } from "@/components/ui/selecao";
import { acaoContarReenvioPrimeiroAcesso, acaoReenviarPrimeiroAcesso } from "@/lib/actions/campanhas";
import { PUBLICO_VAZIO, pessoas, tempoEstimado } from "../../campanhas/_components/comum";
import { useAcao } from "./use-acao";

export interface ReenviarAcessoProps {
  grupos: readonly { id: string; nome: string }[];
  /** Grupo do filtro da lista (o diálogo abre com ele). */
  grupoInicial?: string;
  /** SMTP configurado na plataforma (sem ele nada sai: o botão fica travado). */
  emailLigado: boolean;
  limite: { hora: number; dia: number };
}

type Contagem = { total: number; receberao: number; foraDaRegra: number };
type Feito = { enfileirados: number; foraDaRegra: number; alemDoLimite: number };

/**
 * "Reenviar acesso" (RN-226): escolhe o filtro, mostra quantas pessoas recebem um link NOVO de criar a
 * senha (o antigo deixa de valer) e quanto tempo a fila leva pelo teto; confirma com bloqueio de 3 s.
 */
export function ReenviarAcesso({ grupos, grupoInicial, emailLigado, limite }: ReenviarAcessoProps) {
  const [aberto, setAberto] = useState(false);
  const [grupoId, setGrupoId] = useState(grupoInicial ?? "");
  const [nuncaAcessou, setNuncaAcessou] = useState(true);
  const [contagem, setContagem] = useState<Contagem | null>(null);
  const [contando, iniciarContagem] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [feito, setFeito] = useState<Feito | null>(null);
  const { erro, setErro, pendente, rodar } = useAcao();
  const publico = { ...PUBLICO_VAZIO, grupoIds: grupoId ? [grupoId] : [], nuncaAcessou };

  useEffect(() => {
    if (!aberto) return;
    let valido = true;
    iniciarContagem(async () => {
      const r = await acaoContarReenvioPrimeiroAcesso({ publico: { ...PUBLICO_VAZIO, grupoIds: grupoId ? [grupoId] : [], nuncaAcessou } });
      if (!valido) return;
      if (r.ok) setContagem(r.dados);
      else setErro(r.erro);
    });
    return () => {
      valido = false;
    };
  }, [aberto, grupoId, nuncaAcessou, setErro]);

  const fechar = () => {
    setAberto(false);
    setConfirmando(false);
    setFeito(null);
    setContagem(null);
    setErro(null);
  };
  const n = contagem?.receberao ?? 0;
  const tempo = tempoEstimado(Math.min(n, 5000), limite);
  const grupo = grupos.find((g) => g.id === grupoId)?.nome;
  const quem = [grupo ? `do grupo ${grupo}` : "de todos os grupos", nuncaAcessou ? "que nunca acessaram" : null].filter(Boolean).join(" ");

  return (
    <>
      <Button variant="contorno" size="36" onClick={() => setAberto(true)}>
        <MailCheck className="size-3.5" aria-hidden />
        Reenviar acesso
      </Button>

      <DialogoAdmin
        aberto={aberto && !confirmando && !feito}
        onFechar={fechar}
        titulo="Reenviar acesso"
        descricao="Cada pessoa recebe por e-mail um link novo para criar a senha e entrar."
        rodape={
          <>
            <Button variant="contorno" size="42" onClick={fechar}>
              Cancelar
            </Button>
            <Button size="42" disabled={!emailLigado || contando || n === 0} onClick={() => setConfirmando(true)}>
              {n > 0 ? `Reenviar para ${pessoas(n)}` : "Reenviar"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Selecao
            rotulo="Grupo"
            vazio="Todos os grupos"
            opcoes={grupos.map((g) => ({ valor: g.id, rotulo: g.nome }))}
            value={grupoId}
            onChange={(e) => setGrupoId(e.target.value)}
          />
          <CaixaSelecao className="text-text" rotulo="Só quem nunca acessou" checked={nuncaAcessou} onChange={(e) => setNuncaAcessou(e.target.checked)} />

          <div className="rounded-lg border border-border bg-bg px-3.5 py-3" aria-live="polite">
            {contagem === null || contando ? (
              <p className="m-0 text-sm text-muted">Contando...</p>
            ) : (
              <>
                <p className="m-0 text-[15px] font-semibold tabular-nums">
                  {n === 0 ? "Ninguém neste filtro" : `${pessoas(n)} ${n === 1 ? "vai" : "vão"} receber um link novo por e-mail`}
                </p>
                {contagem.foraDaRegra > 0 && (
                  <p className="m-0 mt-1 text-[13px] text-muted tabular-nums">
                    {pessoas(contagem.foraDaRegra)} {contagem.foraDaRegra === 1 ? "fica" : "ficam"} de fora pela regra de segurança do link (por exemplo, quem também participa de outra área). Essas pessoas pedem a senha pela tela de entrar.
                  </p>
                )}
                {n > 5000 && <p className="m-0 mt-1 text-[13px] text-muted">Vão as primeiras 5.000 agora; reenvie depois para o restante.</p>}
              </>
            )}
          </div>

          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] text-muted">
            <li>O link que a pessoa recebeu antes deixa de valer. Vale o do e-mail novo, por 24 horas a partir da chegada.</li>
            <li>
              Os e-mails saem aos poucos, até {limite.hora} por hora, para a caixa de e-mail não ser bloqueada.
              {tempo && n > 0 && ` Para ${pessoas(Math.min(n, 5000))}: ${tempo}.`}
            </li>
            <li>Chega também para quem se descadastrou das campanhas: é um e-mail de acesso à conta.</li>
          </ul>

          {!emailLigado && <Aviso tom="erro">O envio de e-mail não está configurado nesta plataforma. Fale com o suporte.</Aviso>}
          {erro && <Aviso tom="erro">{erro}</Aviso>}
        </div>
      </DialogoAdmin>

      <ModalConfirmacaoBlock
        aberto={confirmando && !feito && erro === null}
        titulo={`Reenviar acesso para ${pessoas(n)}?`}
        mensagem={`Vamos mandar um link novo de criar a senha para ${pessoas(n)} ${quem}. Os links antigos deixam de valer. Os e-mails saem aos poucos${tempo ? ` (${tempo})` : ""}.`}
        textoConfirmar="Reenviar"
        carregando={pendente}
        onCancelar={() => setConfirmando(false)}
        onConfirmar={() =>
          rodar(
            () => acaoReenviarPrimeiroAcesso({ publico }),
            (d) => {
              setConfirmando(false);
              setFeito(d);
            },
          )
        }
      />

      <DialogoAdmin
        aberto={aberto && (!!feito || (confirmando && erro !== null))}
        onFechar={fechar}
        titulo={feito ? "Reenvio a caminho" : "Não foi possível reenviar"}
        descricao={
          feito
            ? feito.enfileirados === 0
              ? "Ninguém novo para receber neste filtro."
              : `${pessoas(feito.enfileirados)} na fila de envio. Os e-mails saem aos poucos: ${tempoEstimado(feito.enfileirados, limite)}. Pode fechar esta tela.`
            : erro
        }
        rodape={
          <Button size="42" onClick={fechar}>
            Entendi
          </Button>
        }
      >
        {feito && (feito.foraDaRegra > 0 || feito.alemDoLimite > 0) && (
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] text-muted">
            {feito.foraDaRegra > 0 && <li>{pessoas(feito.foraDaRegra)} ficaram de fora pela regra de segurança do link.</li>}
            {feito.alemDoLimite > 0 && <li>{pessoas(feito.alemDoLimite)} passaram do limite de 5.000 por vez: reenvie depois.</li>}
          </ul>
        )}
      </DialogoAdmin>
    </>
  );
}
