"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SlidersHorizontal } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { AreaTexto } from "@/components/ui/area-texto";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { acaoAjustarPontos } from "@/lib/actions/gamificacao";
import { ajustePontosSchema } from "@/lib/validators/gamificacao";

export interface AjustarPontosProps {
  membroId: string;
  nome: string;
  saldo: number;
}

/**
 * "Ajustar pontos" (RN-145): valor positivo ou negativo + justificativa obrigatória; confirmação
 * no modal block (3 s) com o resumo do saldo antes e depois. Lançamento nunca se desfaz: corrigir
 * = outro ajuste com o sinal contrário.
 */
export function AjustarPontos({ membroId, nome, saldo }: AjustarPontosProps) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<"fechado" | "editar" | "confirmar">("fechado");
  const [pontos, setPontos] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const fechar = () => {
    setEtapa("fechado");
    setPontos("");
    setJustificativa("");
    setErro(null);
  };
  const n = Number(pontos);
  const sinal = n > 0 ? `+${n.toLocaleString("pt-BR")}` : n.toLocaleString("pt-BR");

  return (
    <>
      <Button variant="contorno" size="36" onClick={() => setEtapa("editar")} aria-label={`Ajustar pontos de ${nome}`}>
        <SlidersHorizontal aria-hidden />
        <span className="hidden min-[640px]:inline">Ajustar pontos</span>
      </Button>
      <DialogoAdmin
        aberto={etapa === "editar"}
        onFechar={fechar}
        titulo="Ajustar pontos"
        descricao={`${nome} tem ${saldo.toLocaleString("pt-BR")} pontos. Use negativo para retirar. O ajuste aparece no extrato do aluno e fica na trilha com o seu nome.`}
        rodape={
          <>
            <Button variant="contorno" size="42" onClick={fechar}>
              Cancelar
            </Button>
            <Button
              size="42"
              onClick={() => {
                const v = ajustePontosSchema.safeParse({ membroId, pontos: n, justificativa });
                if (!pontos.trim() || !v.success) return setErro(!pontos.trim() ? "Informe os pontos do ajuste." : (v.error?.issues[0]?.message ?? "Dados inválidos."));
                setErro(null);
                setEtapa("confirmar");
              }}
            >
              Revisar ajuste
            </Button>
          </>
        }
      >
        <Campo
          rotulo="Pontos"
          type="number"
          inputMode="numeric"
          step={1}
          min={-100000}
          max={100000}
          placeholder="Ex.: 50 ou -20"
          value={pontos}
          onChange={(e) => setPontos(e.target.value)}
          tamanho="42"
          classNameMoldura="max-w-[200px]"
        />
        <AreaTexto
          rotulo="Justificativa"
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          maxLength={500}
          rows={3}
          ajuda="5 a 500 caracteres. O aluno vê o ajuste no extrato; a equipe vê quem ajustou e por quê."
        />
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </DialogoAdmin>
      <ModalConfirmacaoBlock
        aberto={etapa === "confirmar"}
        titulo="Confirmar ajuste de pontos"
        mensagem={`${sinal} pontos para ${nome} (saldo ${saldo.toLocaleString("pt-BR")} → ${(saldo + n).toLocaleString("pt-BR")}). Motivo: "${justificativa.trim()}". O lançamento não pode ser apagado; para corrigir, faça outro ajuste com o sinal contrário.`}
        textoConfirmar="Lançar ajuste"
        carregando={pendente}
        onCancelar={() => setEtapa("editar")}
        onConfirmar={() =>
          iniciar(async () => {
            const r = await acaoAjustarPontos({ membroId, pontos: n, justificativa }).catch(() => null);
            if (!r || !r.ok) {
              setErro(r ? r.erro : "Sem conexão com o servidor. Tente de novo.");
              return setEtapa("editar");
            }
            fechar();
            router.refresh();
          })
        }
      />
    </>
  );
}
