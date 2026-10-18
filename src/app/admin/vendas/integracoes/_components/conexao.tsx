"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import type { Resultado } from "@/lib/acao";
import { acaoConectarIntegracao, acaoDesconectarIntegracao, acaoTrocarSegredoIntegracao } from "@/lib/actions/integracoes";
import type { PlataformaIntegracao } from "@/lib/db/schema/_enums";
import { NOME_DO_TOKEN, ROTULO_PLATAFORMA } from "@/lib/integracoes/regras";
import { conectarIntegracaoSchema } from "@/lib/validators/integracoes";

const SEM_CONEXAO = "Sem conexão com o servidor. Tente de novo.";

function useRodar() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = <T,>(acao: () => Promise<Resultado<T>>, depois?: () => void) =>
    iniciar(async () => {
      const r = await acao().catch(() => null);
      if (!r) return setErro(SEM_CONEXAO);
      if (!r.ok) return setErro(r.erro);
      setErro(null);
      depois?.();
      router.refresh();
    });
  return { erro, setErro, pendente, rodar };
}

/** Campo do token + "Conectar". O token vai para o servidor e não volta (a tela mostra só os 4 finais). */
export function FormConectar({ plataforma }: { plataforma: PlataformaIntegracao }) {
  const [segredo, setSegredo] = useState("");
  const [erroCampo, setErroCampo] = useState<string | undefined>();
  const { erro, pendente, rodar } = useRodar();
  const nome = NOME_DO_TOKEN[plataforma];
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const v = conectarIntegracaoSchema.safeParse({ plataforma, segredo });
        if (!v.success) return setErroCampo(v.error.issues[0]?.message);
        setErroCampo(undefined);
        rodar(() => acaoConectarIntegracao(v.data), () => setSegredo(""));
      }}
    >
      <Campo
        rotulo={`${nome} da ${ROTULO_PLATAFORMA[plataforma]}`}
        value={segredo}
        onChange={(e) => setSegredo(e.target.value)}
        maxLength={200}
        tamanho="42"
        autoComplete="off"
        spellCheck={false}
        erro={erroCampo}
        className="font-mono text-[13px]"
      />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Button type="submit" size="42" carregando={pendente} className="self-start">
        {pendente ? "Conectando..." : `Conectar ${ROTULO_PLATAFORMA[plataforma]}`}
      </Button>
    </form>
  );
}

/** "Trocar token" (diálogo) e "Desconectar" (ModalConfirmacaoBlock: a URL para de funcionar). */
export function AcoesConexao({ id, plataforma, versao }: { id: string; plataforma: PlataformaIntegracao; versao: string }) {
  const [aberto, setAberto] = useState<"trocar" | "desconectar" | null>(null);
  const [segredo, setSegredo] = useState("");
  const { erro, setErro, pendente, rodar } = useRodar();
  const nome = NOME_DO_TOKEN[plataforma];
  const rotulo = ROTULO_PLATAFORMA[plataforma];
  const fechar = () => {
    setAberto(null);
    setSegredo("");
    setErro(null);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="contorno" size="36" onClick={() => setAberto("trocar")}>
        Trocar {nome.toLowerCase()}
      </Button>
      <Button variant="perigo" size="36" onClick={() => setAberto("desconectar")}>
        Desconectar
      </Button>

      <DialogoAdmin
        aberto={aberto === "trocar"}
        onFechar={fechar}
        titulo={`Trocar ${nome.toLowerCase()} da ${rotulo}`}
        descricao={`Use quando a ${rotulo} gerar um novo. A URL do webhook continua a mesma.`}
        rodape={
          <>
            <Button variant="contorno" size="42" onClick={fechar} disabled={pendente}>
              Cancelar
            </Button>
            <Button size="42" carregando={pendente} onClick={() => rodar(() => acaoTrocarSegredoIntegracao({ integracaoId: id, versao, segredo: segredo.trim() }), fechar)}>
              Salvar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Campo rotulo={`${nome} novo`} value={segredo} onChange={(e) => setSegredo(e.target.value)} maxLength={200} tamanho="42" autoComplete="off" spellCheck={false} className="font-mono text-[13px]" />
          {erro && <Aviso tom="erro">{erro}</Aviso>}
        </div>
      </DialogoAdmin>

      <ModalConfirmacaoBlock
        aberto={aberto === "desconectar"}
        titulo={`Desconectar a ${rotulo}`}
        mensagem={`A URL do webhook deixa de funcionar e os mapeamentos de produtos da ${rotulo} são removidos. Quem já tem acesso continua com ele. Para voltar, conecte de novo e cole a URL nova na ${rotulo}.`}
        textoConfirmar="Desconectar"
        carregando={pendente}
        onCancelar={fechar}
        onConfirmar={() => {
          setAberto(null);
          rodar(() => acaoDesconectarIntegracao({ integracaoId: id, versao }));
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
