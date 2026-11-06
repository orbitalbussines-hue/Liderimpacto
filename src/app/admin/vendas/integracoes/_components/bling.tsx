"use client";

import { useState, useTransition } from "react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { acaoAutorizarBling, acaoConectarBling, acaoDesconectarIntegracao, acaoTrocarCredenciaisBling } from "@/lib/actions/integracoes";
import type { SituacaoAutorizacaoIntegracao } from "@/lib/db/schema/_enums";
import { conectarBlingSchema } from "@/lib/validators/integracoes";
import { useRodar } from "./conexao";

/** Bling (ADR-0024, RN-260): credenciais do app, autorização OAuth, troca e desconexão. Segredos não voltam à tela. */

function CamposCredenciais({ clienteId, setClienteId, secret, setSecret, erros }: { clienteId: string; setClienteId: (v: string) => void; secret: string; setSecret: (v: string) => void; erros: { clienteId?: string; clientSecret?: string } }) {
  return (
    <>
      <Campo rotulo="Client ID" value={clienteId} onChange={(e) => setClienteId(e.target.value)} maxLength={100} tamanho="42" autoComplete="off" spellCheck={false} erro={erros.clienteId} className="font-mono text-[13px]" />
      <Campo rotulo="Client Secret" value={secret} onChange={(e) => setSecret(e.target.value)} maxLength={200} tamanho="42" autoComplete="off" spellCheck={false} erro={erros.clientSecret} className="font-mono text-[13px]" />
    </>
  );
}

function errosDe(clienteId: string, clientSecret: string) {
  const v = conectarBlingSchema.safeParse({ clienteId, clientSecret });
  if (v.success) return { dados: v.data, erros: {} };
  const erros: { clienteId?: string; clientSecret?: string } = {};
  for (const i of v.error.issues) erros[i.path[0] as "clienteId" | "clientSecret"] ??= i.message;
  return { dados: null, erros };
}

/** Client ID + Client Secret do app criado no Bling → "Conectar Bling". */
export function FormConectarBling() {
  const [clienteId, setClienteId] = useState("");
  const [secret, setSecret] = useState("");
  const [erros, setErros] = useState<{ clienteId?: string; clientSecret?: string }>({});
  const { erro, pendente, rodar } = useRodar();
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const r = errosDe(clienteId, secret);
        setErros(r.erros);
        if (r.dados) rodar(() => acaoConectarBling(r.dados), () => setSecret(""));
      }}
    >
      <CamposCredenciais clienteId={clienteId} setClienteId={setClienteId} secret={secret} setSecret={setSecret} erros={erros} />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Button type="submit" size="42" carregando={pendente} className="self-start">
        {pendente ? "Conectando..." : "Conectar Bling"}
      </Button>
    </form>
  );
}

/** "Autorizar no Bling" (vai ao Bling e volta), "Trocar credenciais" e "Desconectar" (ModalConfirmacaoBlock). */
export function AcoesBling({ integracaoId, versao, situacao }: { integracaoId: string; versao: string; situacao: SituacaoAutorizacaoIntegracao }) {
  const [aberto, setAberto] = useState<"trocar" | "desconectar" | null>(null);
  const [clienteId, setClienteId] = useState("");
  const [secret, setSecret] = useState("");
  const [erros, setErros] = useState<{ clienteId?: string; clientSecret?: string }>({});
  const { erro, setErro, pendente, rodar } = useRodar();
  const [indo, iniciar] = useTransition();
  const fechar = () => {
    setAberto(null);
    setSecret("");
    setErro(null);
  };
  const autorizar = () =>
    iniciar(async () => {
      const r = await acaoAutorizarBling({ integracaoId }).catch(() => null);
      if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
      if (!r.ok) return setErro(r.erro);
      window.location.assign(r.dados.url);
    });
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="36" carregando={indo} onClick={autorizar}>
        {situacao === "AUTORIZADA" ? "Autorizar de novo" : situacao === "REAUTORIZAR" ? "Reautorizar" : "Autorizar no Bling"}
      </Button>
      <Button variant="contorno" size="36" onClick={() => setAberto("trocar")}>
        Trocar credenciais
      </Button>
      <Button variant="perigo" size="36" onClick={() => setAberto("desconectar")}>
        Desconectar
      </Button>

      <DialogoAdmin
        aberto={aberto === "trocar"}
        onFechar={fechar}
        titulo="Trocar credenciais do Bling"
        descricao="Use quando criar outro app ou redefinir o client secret no Bling. Depois de salvar, autorize de novo."
        rodape={
          <>
            <Button variant="contorno" size="42" onClick={fechar} disabled={pendente}>
              Cancelar
            </Button>
            <Button
              size="42"
              carregando={pendente}
              onClick={() => {
                const r = errosDe(clienteId, secret);
                setErros(r.erros);
                if (r.dados) rodar(() => acaoTrocarCredenciaisBling({ integracaoId, versao, ...r.dados }), fechar);
              }}
            >
              Salvar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <CamposCredenciais clienteId={clienteId} setClienteId={setClienteId} secret={secret} setSecret={setSecret} erros={erros} />
          {erro && <Aviso tom="erro">{erro}</Aviso>}
        </div>
      </DialogoAdmin>

      <ModalConfirmacaoBlock
        aberto={aberto === "desconectar"}
        titulo="Desconectar o Bling"
        mensagem="A URL do webhook deixa de funcionar, a autorização é apagada e os mapeamentos de SKU saem. Quem já resgatou continua com o acesso, mas novos resgates por número do pedido param. Para voltar, conecte de novo e cole a URL nova no app do Bling."
        textoConfirmar="Desconectar"
        carregando={pendente}
        onCancelar={fechar}
        onConfirmar={() => {
          setAberto(null);
          rodar(() => acaoDesconectarIntegracao({ integracaoId, versao }));
        }}
      />
      {erro && aberto === null && (
        <Aviso tom="erro" className="basis-full">
          {erro}
        </Aviso>
      )}
    </div>
  );
}
